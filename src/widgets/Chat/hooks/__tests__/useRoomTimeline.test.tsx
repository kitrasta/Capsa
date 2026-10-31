// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// matrix-js-sdk мокаем целиком: хуку нужны только enum'ы событий,
// а публичный API слоя (getClient) — чтобы не тянуть runtime клиента
vi.mock('matrix-js-sdk', () => ({
    RoomEvent: { Timeline: 'Room.timeline', LocalEchoUpdated: 'Room.localEchoUpdated' },
    MatrixEventEvent: { Decrypted: 'Event.decrypted' },
}));
vi.mock('../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { RoomEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient } from '../../../../shared/lib/matrix';
import { useRoomTimeline } from '../useRoomTimeline';

type Handler = (...args: unknown[]) => void;

const makeEmitter = () => {
    const handlers = new Map<string, Set<Handler>>();
    return {
        on: vi.fn((event: string, cb: Handler) => {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(cb);
        }),
        off: vi.fn((event: string, cb: Handler) => {
            handlers.get(event)?.delete(cb);
        }),
        emit: (event: string, ...args: unknown[]) => {
            handlers.get(event)?.forEach((cb) => cb(...args));
        },
    };
};

const ROOM_ID = '!room:example.org';

const makeEvent = (
    id: string,
    opts: { type?: string; body?: string; redacted?: boolean; roomId?: string } = {},
) => ({
    getId: () => id,
    getType: () => opts.type ?? 'm.room.message',
    getContent: () => (opts.body !== undefined ? { body: opts.body } : {}),
    isRedacted: () => opts.redacted ?? false,
    getRoomId: () => opts.roomId ?? ROOM_ID,
    getRelation: () => null,
});

const setup = (events: unknown[]) => {
    const roomEvents = makeEmitter();
    const clientEvents = makeEmitter();
    const room = {
        roomId: ROOM_ID,
        on: roomEvents.on,
        off: roomEvents.off,
        getLiveTimeline: () => ({ getEvents: () => events }),
        findEventById: vi.fn(),
        getUnfilteredTimelineSet: () => ({
            relations: {
                getChildEventsForEvent: vi.fn(() => ({ getSortedAnnotationsByKey: () => [] })),
            },
        }),
        currentState: {
            getMember: () => ({ name: '' }),
        },
    };
    vi.mocked(getClient).mockReturnValue(clientEvents as unknown as ReturnType<typeof getClient>);
    const hook = renderHook(() => useRoomTimeline(room as never));
    return { hook, roomEvents, clientEvents, events };
};

beforeEach(() => {
    vi.mocked(getClient).mockReset();
});

describe('useRoomTimeline: фильтрация', () => {
    it('в ленту попадают только неотредактированные сообщения с body', () => {
        const { hook } = setup([
            makeEvent('m1', { body: 'hello' }),
            makeEvent('m2', { body: 'redacted', redacted: true }),
            makeEvent('m3', { type: 'm.room.encrypted' }),
            makeEvent('m4'), // без body
        ]);

        expect(hook.result.current.map((e) => e.getId())).toEqual(['m1']);
    });
});

describe('useRoomTimeline: события', () => {
    it('RoomEvent.Timeline пересобирает ленту', () => {
        const { hook, roomEvents, events } = setup([makeEvent('m1', { body: 'hello' })]);
        expect(hook.result.current).toHaveLength(1);

        act(() => {
            events.push(makeEvent('m2', { body: 'new' }));
            roomEvents.emit(RoomEvent.Timeline);
        });

        expect(hook.result.current.map((e) => e.getId())).toEqual(['m1', 'm2']);
    });

    it('LocalEchoUpdated тоже пересобирает ленту', () => {
        const { hook, roomEvents, events } = setup([makeEvent('m1', { body: 'hello' })]);

        act(() => {
            events.push(makeEvent('local', { body: 'echo' }));
            roomEvents.emit(RoomEvent.LocalEchoUpdated);
        });

        expect(hook.result.current.map((e) => e.getId())).toEqual(['m1', 'local']);
    });
});

describe('useRoomTimeline: расшифровка', () => {
    it('Decrypted события этой комнаты появляются в ленте', () => {
        const encrypted = makeEvent('e1', { type: 'm.room.encrypted' });
        const { hook, clientEvents, events } = setup([makeEvent('m1', { body: 'hello' }), encrypted]);
        expect(hook.result.current).toHaveLength(1);

        // после расшифровки событие становится видимым сообщением
        act(() => {
            events[1] = makeEvent('e1', { body: 'secret' });
            clientEvents.emit(MatrixEventEvent.Decrypted, events[1]);
        });

        expect(hook.result.current.map((e) => e.getId())).toEqual(['m1', 'e1']);
    });

    it('Decrypted другой комнаты ленту не трогает', () => {
        const { hook, clientEvents } = setup([makeEvent('m1', { body: 'hello' })]);

        act(() => {
            clientEvents.emit(
                MatrixEventEvent.Decrypted,
                makeEvent('x1', { body: 'other', roomId: '!other:example.org' }),
            );
        });

        expect(hook.result.current.map((e) => e.getId())).toEqual(['m1']);
    });

    it('Decrypted с ошибкой (не расшифровалось) не пересобирает ленту', () => {
        const { hook, clientEvents } = setup([makeEvent('m1', { body: 'hello' })]);
        const before = hook.result.current;

        act(() => {
            clientEvents.emit(
                MatrixEventEvent.Decrypted,
                makeEvent('e1', { body: 'secret' }),
                new Error('decrypt failed'),
            );
        });

        // memo даже не пересчитался — та же ссылка
        expect(hook.result.current).toBe(before);
    });

    it('повторный Decrypted того же события не пересобирает ленту', () => {
        const { hook, clientEvents } = setup([makeEvent('m1', { body: 'hello' })]);
        const event = makeEvent('e1', { body: 'secret' });

        act(() => {
            clientEvents.emit(MatrixEventEvent.Decrypted, event);
            clientEvents.emit(MatrixEventEvent.Decrypted, event);
        });

        const after = hook.result.current;
        act(() => {
            clientEvents.emit(MatrixEventEvent.Decrypted, event);
        });
        expect(hook.result.current).toBe(after);
    });
});
