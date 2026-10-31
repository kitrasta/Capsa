// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('matrix-js-sdk', () => ({
    NotificationCountType: { Total: 'total', Highlight: 'highlight' },
    RoomEvent: {
        Timeline: 'Room.timeline',
        LocalEchoUpdated: 'Room.localEchoUpdated',
        Receipt: 'Room.receipt',
        UnreadNotifications: 'Room.unreadNotifications',
    },
    RoomStateEvent: { Events: 'RoomState.events' },
    MatrixEventEvent: { Decrypted: 'Event.decrypted' },
}));
vi.mock('../../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient } from '../../../../../shared/lib/matrix';
import { useRoomListItem } from '../useRoomListItem';

afterEach(cleanup);

type Handler = (...args: unknown[]) => void;

const MY_ID = '@me:example.org';

const makeEvent = (type: string, opts: { id?: string; body?: string; sender?: string } = {}) => ({
    getId: () => opts.id ?? '$event',
    getSender: () => opts.sender ?? '@alice:example.org',
    getType: () => type,
    getContent: () => (opts.body !== undefined ? { body: opts.body } : {}),
    getRoomId: () => '!room:example.org',
});

const setup = (opts: {
    events?: unknown[];
    lastEvent?: unknown;
    serverUnread?: number | null;
    memberName?: string;
    readUpTo?: string | null;
}) => {
    const roomHandlers = new Map<string, Set<Handler>>();
    const clientHandlers = new Map<string, Set<Handler>>();
    const emitter = (map: Map<string, Set<Handler>>) => ({
        on: vi.fn((event: string, cb: Handler) => {
            if (!map.has(event)) map.set(event, new Set());
            map.get(event)!.add(cb);
        }),
        off: vi.fn((event: string, cb: Handler) => {
            map.get(event)?.delete(cb);
        }),
    });

    const client = { getUserId: () => MY_ID, ...emitter(clientHandlers) };
    vi.mocked(getClient).mockReturnValue(client as unknown as ReturnType<typeof getClient>);

    const getEventReadUpTo = vi.fn(() => opts.readUpTo ?? null);
    const room = {
        roomId: '!room:example.org',
        name: 'General',
        getLastLiveEvent: () => opts.lastEvent ?? null,
        currentState: { getMember: () => (opts.memberName ? { name: opts.memberName } : null) },
        getLiveTimeline: () => ({ getEvents: () => opts.events ?? [] }),
        getEventReadUpTo,
        getRoomUnreadNotificationCount: vi.fn(() => opts.serverUnread ?? null),
        getMxcAvatarUrl: vi.fn(() => 'mxc://avatar/1'),
        getLastActiveTimestamp: vi.fn(() => 1700000000000),
        ...emitter(roomHandlers),
    };

    const hook = renderHook(() => useRoomListItem(room as never));
    const emit = (map: Map<string, Set<Handler>>, event: string, ...args: unknown[]) =>
        act(() => {
            map.get(event)?.forEach((cb) => cb(...args));
        });

    return {
        hook,
        getEventReadUpTo,
        emitRoom: (event: string, ...args: unknown[]) => emit(roomHandlers, event, ...args),
        emitClient: (event: string, ...args: unknown[]) => emit(clientHandlers, event, ...args),
    };
};

describe('useRoomListItem: превью последнего сообщения', () => {
    it('сообщение с body → превью с именем отправителя', () => {
        const { hook } = setup({
            lastEvent: makeEvent('m.room.message', { body: 'hello' }),
            memberName: 'Alice',
        });

        expect(hook.result.current.lastMessage).toEqual({
            senderId: '@alice:example.org',
            senderName: 'Alice',
            text: 'hello',
        });
        expect(hook.result.current.isMe).toBe(false);
    });

    it('моё сообщение → isMe', () => {
        const { hook } = setup({
            lastEvent: makeEvent('m.room.message', { body: 'hi', sender: MY_ID }),
        });
        expect(hook.result.current.isMe).toBe(true);
    });

    it('зашифрованное событие → «🔒 Зашифрованное сообщение»', () => {
        const { hook } = setup({ lastEvent: makeEvent('m.room.encrypted') });
        expect(hook.result.current.lastMessage?.text).toBe('🔒 Зашифрованное сообщение');
    });

    it('member-событие → «обновил(а) профиль»; событие без body → нет превью', () => {
        const member = setup({ lastEvent: makeEvent('m.room.member') });
        expect(member.hook.result.current.lastMessage?.text).toBe('обновил(а) профиль');

        const noBody = setup({ lastEvent: makeEvent('m.room.message') });
        expect(noBody.hook.result.current.lastMessage).toBeNull();
    });
});

describe('useRoomListItem: непрочитанные', () => {
    it('серверный счётчик O(1) в приоритете — локальный подсчёт даже не запускается', () => {
        const { hook, getEventReadUpTo } = setup({
            serverUnread: 3,
            events: [makeEvent('m.room.message', { body: 'a' })],
        });

        expect(hook.result.current.unread).toBe(3);
        expect(hook.result.current.hasUnread).toBe(true);
        expect(getEventReadUpTo).not.toHaveBeenCalled();
    });

    it('серверный счётчик 0 — валидный результат, fallback не нужен', () => {
        const { hook, getEventReadUpTo } = setup({
            serverUnread: 0,
            events: [makeEvent('m.room.message', { body: 'a' })],
        });

        expect(hook.result.current.unread).toBe(0);
        expect(hook.result.current.hasUnread).toBe(false);
        expect(getEventReadUpTo).not.toHaveBeenCalled();
    });

    it('fallback: без серверного — локальный честный подсчёт (свои не считаем)', () => {
        const events = [
            makeEvent('m.room.message', { id: 'r', body: 'прочитано' }),
            makeEvent('m.room.message', { id: '1', body: 'новое' }),
            makeEvent('m.room.message', { id: '2', body: 'моё', sender: MY_ID }),
            makeEvent('m.room.message', { id: '3', body: 'ещё новое' }),
        ];
        const { hook } = setup({ events, readUpTo: 'r' });

        // после receipt 'r': '1' и '3' (своё '2' не считаем) = 2
        expect(hook.result.current.unread).toBe(2);
    });

    it('receipt вне live-ленты и без серверного счётчика → 0', () => {
        const { hook } = setup({
            events: [makeEvent('m.room.message', { body: 'x' })],
            readUpTo: '$unknown',
        });

        expect(hook.result.current.unread).toBe(0);
        expect(hook.result.current.hasUnread).toBe(false);
    });
});

describe('useRoomListItem: реактивность и мемоизация', () => {
    it('обновляется по событию комнаты (Timeline), а не по рендерам', () => {
        const state = { body: 'old' };
        const event = makeEvent('m.room.message', state);
        const { hook, emitRoom } = setup({ lastEvent: event });
        expect(hook.result.current.lastMessage?.text).toBe('old');

        state.body = 'new';
        emitRoom(RoomEvent.Timeline);

        expect(hook.result.current.lastMessage?.text).toBe('new');
    });

    it('расшифровка (клиентское событие этой комнаты) обновляет превью', () => {
        let current: unknown = makeEvent('m.room.encrypted');
        const { hook, emitClient } = setup({ get lastEvent() { return current; } });
        expect(hook.result.current.lastMessage?.text).toBe('🔒 Зашифрованное сообщение');

        // после расшифровки последнее событие стало видимым сообщением
        current = makeEvent('m.room.message', { body: 'secret' });
        emitClient(MatrixEventEvent.Decrypted, current);

        expect(hook.result.current.lastMessage?.text).toBe('secret');
    });

    it('перерендер без событий не пересчитывает локальный подсчёт', () => {
        const events = [makeEvent('m.room.message', { id: '1', body: 'x' })];
        const { hook, getEventReadUpTo, emitRoom } = setup({ events, readUpTo: 'r' });
        expect(getEventReadUpTo).toHaveBeenCalledTimes(1);

        hook.rerender();
        hook.rerender();
        expect(getEventReadUpTo).toHaveBeenCalledTimes(1); // мемоизация держит

        emitRoom(RoomEvent.Timeline); // реальное изменение → пересчёт
        expect(getEventReadUpTo).toHaveBeenCalledTimes(2);
    });
});
