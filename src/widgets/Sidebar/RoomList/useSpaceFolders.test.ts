// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ClientEvent, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { SpaceChildSummary } from '../../../shared/lib/matrix';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getSpaceChildSummaries: vi.fn(),
}));

vi.mock('../../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../shared/lib/matrix')>()),
    getClient: mocks.getClient,
    getSpaceChildSummaries: mocks.getSpaceChildSummaries,
}));

import { useSpaceFolders } from './useSpaceFolders';

const childEvent = (childId: string): MatrixEvent => ({
    getStateKey: () => childId,
    getContent: () => ({ via: ['example.org'] }),
}) as unknown as MatrixEvent;

const makeRoom = (
    roomId: string,
    name: string,
    options: { space?: boolean; children?: string[]; membership?: string; timestamp?: number } = {},
): Room => ({
    roomId,
    name,
    isSpaceRoom: () => options.space === true,
    getMyMembership: () => options.membership ?? 'join',
    getLastActiveTimestamp: () => options.timestamp ?? 0,
    getRoomUnreadNotificationCount: () => 0,
    getMxcAvatarUrl: () => null,
    currentState: {
        getStateEvents: () => (options.children ?? []).map(childEvent),
    },
}) as unknown as Room;

const summary = (name: string, roomType: string | null = null): SpaceChildSummary => ({
    name,
    avatarUrl: null,
    roomType,
    joinRule: null,
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 0,
});

const setup = (rooms: Room[]) => {
    const listeners = new Map<string, () => void>();
    const client = {
        getRooms: () => rooms,
        getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
        on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
        off: vi.fn(),
    } as unknown as MatrixClient;
    mocks.getClient.mockReturnValue(client);
    mocks.getSpaceChildSummaries.mockResolvedValue(new Map());
    return { client, emit: (event: string) => listeners.get(event)?.() };
};

describe('useSpaceFolders', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('показывает корни, а внутри Space — сначала дочерний Space, затем его комнаты', async () => {
        const nested = makeRoom('!nested:example.org', 'Разработка', { space: true });
        const joined = makeRoom('!joined:example.org', 'Общий', { timestamp: 20 });
        const outside = makeRoom('!outside:example.org', 'Вне папки', { timestamp: 30 });
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [joined.roomId, nested.roomId],
        });
        setup([nested, joined, outside, root]);
        const { result } = renderHook(() => useSpaceFolders());

        expect(result.current.roots.map((room) => room.roomId)).toEqual([root.roomId]);
        expect(result.current.path).toEqual([]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            outside.roomId,
            joined.roomId,
        ]);

        act(() => result.current.openRoot(root.roomId));

        expect(result.current.spaces.map((space) => space.roomId)).toEqual([nested.roomId]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([joined.roomId]);
        await waitFor(() => expect(mocks.getSpaceChildSummaries).toHaveBeenCalledWith(root.roomId));
    });

    it('открывает один уровень, возвращается по breadcrumb и не зацикливает путь', () => {
        const nested = makeRoom('!nested:example.org', 'Разработка', { space: true });
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [nested.roomId],
        });
        Object.defineProperty(nested.currentState, 'getStateEvents', {
            value: () => [childEvent(root.roomId)],
        });
        setup([root, nested]);
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openRoot(root.roomId));
        act(() => result.current.openChild(nested.roomId));
        expect(result.current.path.map((room) => room.roomId)).toEqual([root.roomId, nested.roomId]);

        act(() => result.current.openChild(root.roomId));
        expect(result.current.path).toHaveLength(2);

        act(() => result.current.openBreadcrumb(0));
        expect(result.current.path.map((room) => room.roomId)).toEqual([root.roomId]);

        act(() => result.current.showAll());
        expect(result.current.path).toEqual([]);
    });

    it('дозагружает summary неизвестной комнаты, не заменяя её глобальным loader', async () => {
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: ['!unknown:example.org'],
        });
        setup([root]);
        mocks.getSpaceChildSummaries.mockResolvedValue(new Map([
            ['!unknown:example.org', summary('Публичная')],
        ]));
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openRoot(root.roomId));
        expect(result.current.rooms[0]).toMatchObject({
            roomId: '!unknown:example.org',
            room: null,
            name: '!unknown',
        });

        await waitFor(() => expect(result.current.rooms[0].name).toBe('Публичная'));
        expect(result.current.rooms[0].noAccess).toBe(false);
    });

    it('сохраняет синхронизированного ребёнка при ошибке summary', async () => {
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: ['!unknown:example.org'],
        });
        setup([root]);
        mocks.getSpaceChildSummaries.mockRejectedValue(new Error('forbidden'));
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openRoot(root.roomId));

        await waitFor(() => expect(result.current.enrichmentError).toBe(true));
        expect(result.current.rooms).toHaveLength(1);
        expect(result.current.rooms[0].noAccess).toBe(true);
    });

    it('поднимает комнату по новой live-активности', () => {
        let firstTimestamp = 10;
        const first = makeRoom('!first:example.org', 'Первая');
        first.getLastActiveTimestamp = () => firstTimestamp;
        const second = makeRoom('!second:example.org', 'Вторая', { timestamp: 20 });
        const { emit } = setup([first, second]);
        const { result } = renderHook(() => useSpaceFolders());
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            second.roomId,
            first.roomId,
        ]);

        firstTimestamp = 30;
        act(() => emit(RoomEvent.Timeline));

        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            first.roomId,
            second.roomId,
        ]);
    });

    it('перечитывает состав после RoomStateEvent.Events', async () => {
        const joined = makeRoom('!joined:example.org', 'Общий');
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [joined.roomId],
        });
        const { emit } = setup([root, joined]);
        const { result } = renderHook(() => useSpaceFolders());
        act(() => result.current.openRoot(root.roomId));
        expect(result.current.rooms).toHaveLength(1);

        Object.defineProperty(root.currentState, 'getStateEvents', { value: () => [] });
        act(() => emit(RoomStateEvent.Events));

        expect(result.current.rooms).toEqual([]);
        expect(result.current.spaces).toEqual([]);
        expect(ClientEvent.Room).toBeTruthy();
    });
});
