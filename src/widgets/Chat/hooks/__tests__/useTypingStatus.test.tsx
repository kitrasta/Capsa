// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('matrix-js-sdk', () => ({
    RoomMemberEvent: { Typing: 'RoomMember.typing' },
}));
vi.mock('../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { RoomMemberEvent } from 'matrix-js-sdk';
import { getClient } from '../../../../shared/lib/matrix';
import { useTypingStatus } from '../useTypingStatus';

type Handler = (...args: unknown[]) => void;

const ROOM_ID = '!room:example.org';
const MY_ID = '@me:example.org';

const makeMember = (userId: string, name: string, typing: boolean) => ({
    userId,
    name,
    typing,
});

const setup = (members: ReturnType<typeof makeMember>[]) => {
    const handlers = new Map<string, Set<Handler>>();
    const client = {
        getUserId: () => MY_ID,
        on: vi.fn((event: string, cb: Handler) => {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(cb);
        }),
        off: vi.fn((event: string, cb: Handler) => {
            handlers.get(event)?.delete(cb);
        }),
    };
    vi.mocked(getClient).mockReturnValue(client as unknown as ReturnType<typeof getClient>);

    const room = {
        roomId: ROOM_ID,
        getMembers: () => members,
    };
    const hook = renderHook(() => useTypingStatus(room as never));

    const emitTyping = (member: { roomId: string }) =>
        act(() => {
            handlers.get(RoomMemberEvent.Typing)?.forEach((cb) => cb({}, member));
        });

    return { hook, emitTyping };
};

beforeEach(() => {
    vi.mocked(getClient).mockReset();
});

describe('useTypingStatus: участники', () => {
    it('никто не печатает → null', () => {
        const { hook } = setup([makeMember('@a:example.org', 'Alice', false)]);
        expect(hook.result.current).toBeNull();
    });

    it('печатаю только я → null (себя не показываем)', () => {
        const { hook } = setup([makeMember(MY_ID, 'Me', true)]);
        expect(hook.result.current).toBeNull();
    });

    it('один участник → «Alice печатает…»', () => {
        const { hook } = setup([makeMember('@a:example.org', 'Alice', true)]);
        expect(hook.result.current).toBe('Alice печатает…');
    });

    it('двое → «Alice и Bob печатают…»', () => {
        const { hook } = setup([
            makeMember('@a:example.org', 'Alice', true),
            makeMember('@b:example.org', 'Bob', true),
        ]);
        expect(hook.result.current).toBe('Alice и Bob печатают…');
    });

    it('трое и больше → «несколько человек печатают…»', () => {
        const { hook } = setup([
            makeMember('@a:example.org', 'Alice', true),
            makeMember('@b:example.org', 'Bob', true),
            makeMember('@c:example.org', 'Carol', true),
        ]);
        expect(hook.result.current).toBe('несколько человек печатают…');
    });
});

describe('useTypingStatus: события', () => {
    it('RoomMemberEvent.Typing пересчитывает статус', () => {
        const members = [makeMember('@a:example.org', 'Alice', false)];
        const { hook, emitTyping } = setup(members);
        expect(hook.result.current).toBeNull();

        act(() => {
            members[0] = makeMember('@a:example.org', 'Alice', true);
        });
        emitTyping({ roomId: ROOM_ID });

        expect(hook.result.current).toBe('Alice печатает…');
    });

    it('typing из другой комнаты игнорируется', () => {
        const members = [makeMember('@a:example.org', 'Alice', false)];
        const { hook, emitTyping } = setup(members);

        act(() => {
            members[0] = makeMember('@a:example.org', 'Alice', true);
        });
        emitTyping({ roomId: '!other:example.org' });

        expect(hook.result.current).toBeNull();
    });
});
