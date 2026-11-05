// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

vi.mock('matrix-js-sdk', () => ({
    EventStatus: {
        NOT_SENT: 'not_sent',
        ENCRYPTING: 'encrypting',
        SENDING: 'sending',
        QUEUED: 'queued',
        SENT: 'sent',
        CANCELLED: 'cancelled',
    },
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
vi.mock('../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { EventStatus, NotificationCountType, RoomEvent } from 'matrix-js-sdk';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { getClient } from '../../../../shared/lib/matrix';
import { useRoomListItem } from '../../../Sidebar/RoomList/hooks/useRoomListItem';
import { useMarkRead } from '../useMarkRead';

type Handler = (...args: unknown[]) => void;

const ROOM_ID = '!room:example.org';
const MY_ID = '@me:example.org';

const makeEvent = (id: string, status: EventStatus | null = null): MatrixEvent =>
    ({
        getId: () => id,
        getSender: () => '@alice:example.org',
        getType: () => 'm.room.message',
        getContent: () => ({ body: id }),
        getRoomId: () => ROOM_ID,
        status,
    }) as unknown as MatrixEvent;

const setup = (initialMessages: MatrixEvent[] = [], initialUnread = 3) => {
    let timeline = initialMessages;
    let unread = initialUnread;
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

    const client = {
        getUserId: () => MY_ID,
        setRoomReadMarkers: vi.fn().mockResolvedValue({}),
        ...emitter(clientHandlers),
    };
    vi.mocked(getClient).mockReturnValue(client as unknown as ReturnType<typeof getClient>);

    const room = {
        roomId: ROOM_ID,
        name: 'General',
        getLastLiveEvent: () => timeline.at(-1) ?? null,
        getLiveTimeline: () => ({ getEvents: () => timeline }),
        currentState: { getMember: () => null },
        getEventReadUpTo: vi.fn(() => null),
        getRoomUnreadNotificationCount: vi.fn(() => unread),
        setUnreadNotificationCount: vi.fn((_type: NotificationCountType, count: number) => {
            unread = count;
            roomHandlers.get(RoomEvent.UnreadNotifications)?.forEach((cb) => cb());
        }),
        getMxcAvatarUrl: vi.fn(() => null),
        getLastActiveTimestamp: vi.fn(() => 1700000000000),
        ...emitter(roomHandlers),
    } as unknown as Room;

    return {
        room: room as Room & {
            setUnreadNotificationCount: ReturnType<typeof vi.fn>;
        },
        client,
        setTimeline: (messages: MatrixEvent[]) => {
            timeline = messages;
        },
    };
};

const flushReadMarker = async () => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
    });
};

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('useMarkRead', () => {
    it('при открытии unread room отмечает server event и очищает тот же RoomListItem', async () => {
        const message = makeEvent('$server-latest');
        const { room, client } = setup([message]);
        const hook = renderHook(() => {
            useMarkRead(room, true, [message]);
            return useRoomListItem(room);
        });
        expect(hook.result.current.unread).toBe(3);

        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenCalledWith(
            ROOM_ID,
            '$server-latest',
            message,
        );
        expect(room.setUnreadNotificationCount).toHaveBeenCalledWith(
            NotificationCountType.Total,
            0,
        );
        expect(hook.result.current.unread).toBe(0);
        expect(hook.result.current.hasUnread).toBe(false);
    });

    it('отправляет read receipt для того же server event, чтобы unread сохранялся после reload', async () => {
        const message = makeEvent('$server-with-receipt');
        const { room, client } = setup([message]);

        renderHook(() => useMarkRead(room, true, [message]));
        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenCalledWith(
            ROOM_ID,
            '$server-with-receipt',
            message,
        );
    });

    it.each([
        EventStatus.SENDING,
        EventStatus.QUEUED,
        EventStatus.ENCRYPTING,
        EventStatus.NOT_SENT,
    ])('не отправляет %s local echo в read marker', async (status) => {
        const acknowledged = makeEvent('$acknowledged');
        const localEcho = makeEvent('~local-transaction', status);
        const { room, client } = setup([acknowledged, localEcho]);

        renderHook(() => useMarkRead(room, true, [acknowledged, localEcho]));
        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenCalledTimes(1);
        expect(client.setRoomReadMarkers).toHaveBeenCalledWith(
            ROOM_ID,
            '$acknowledged',
            acknowledged,
        );
        expect(client.setRoomReadMarkers).not.toHaveBeenCalledWith(
            ROOM_ID,
            '~local-transaction',
        );
    });

    it('поздний SENT echo при неизменной длине отмечается после LocalEchoUpdated', async () => {
        const acknowledged = makeEvent('$acknowledged');
        const localEcho = makeEvent('~local-transaction', EventStatus.SENDING);
        const initialMessages = [acknowledged, localEcho];
        const { room, client, setTimeline } = setup(initialMessages);
        const hook = renderHook(
            ({ messages }: { messages: MatrixEvent[] }) => useMarkRead(room, true, messages),
            { initialProps: { messages: initialMessages } },
        );
        await flushReadMarker();
        expect(client.setRoomReadMarkers).toHaveBeenLastCalledWith(
            ROOM_ID,
            '$acknowledged',
            acknowledged,
        );

        const sentEcho = makeEvent('$server-echo', EventStatus.SENT);
        const updatedMessages = [acknowledged, sentEcho];
        setTimeline(updatedMessages);
        hook.rerender({ messages: updatedMessages });
        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenCalledTimes(2);
        expect(client.setRoomReadMarkers).toHaveBeenLastCalledWith(
            ROOM_ID,
            '$server-echo',
            sentEcho,
        );
    });

    it('visible at-bottom live receive отмечает новое событие и снова очищает unread', async () => {
        const first = makeEvent('$first');
        const { room, client, setTimeline } = setup([first], 1);
        const hook = renderHook(
            ({ messages }: { messages: MatrixEvent[] }) => useMarkRead(room, true, messages),
            { initialProps: { messages: [first] } },
        );
        await flushReadMarker();

        const received = makeEvent('$received');
        const updatedMessages = [first, received];
        setTimeline(updatedMessages);
        hook.rerender({ messages: updatedMessages });
        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenNthCalledWith(
            2,
            ROOM_ID,
            '$received',
            received,
        );
        expect(room.setUnreadNotificationCount).toHaveBeenLastCalledWith(
            NotificationCountType.Total,
            0,
        );
    });

    it('после ошибки сохраняет retry и не очищает unread до успеха', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const message = makeEvent('$retry');
        const { room, client, setTimeline } = setup([message]);
        client.setRoomReadMarkers
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce({});
        const hook = renderHook(
            ({ messages }: { messages: MatrixEvent[] }) => useMarkRead(room, true, messages),
            { initialProps: { messages: [message] } },
        );
        await flushReadMarker();
        expect(room.setUnreadNotificationCount).not.toHaveBeenCalled();

        const retryMessages = [message];
        setTimeline(retryMessages);
        hook.rerender({ messages: retryMessages });
        await flushReadMarker();

        expect(client.setRoomReadMarkers).toHaveBeenCalledTimes(2);
        expect(room.setUnreadNotificationCount).toHaveBeenCalledWith(
            NotificationCountType.Total,
            0,
        );
    });

    it('вне нижней границы таймлайна не отправляет read marker', async () => {
        const message = makeEvent('$server-latest');
        const { room, client } = setup([message]);

        renderHook(() => useMarkRead(room, false, [message]));
        await flushReadMarker();

        expect(client.setRoomReadMarkers).not.toHaveBeenCalled();
        expect(room.setUnreadNotificationCount).not.toHaveBeenCalled();
    });
});
