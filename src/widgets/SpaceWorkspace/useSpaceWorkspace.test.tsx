// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
    ClientEvent,
    EventType,
    MatrixEventEvent,
    NotificationCountType,
    RoomEvent,
    RoomStateEvent,
    RoomType,
    SyncState,
} from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { SpaceChildSummary } from '../../shared/lib/matrix';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getSpaceChildSummaries: vi.fn(),
}));

vi.mock('../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../shared/lib/matrix')>()),
    getClient: mocks.getClient,
    getSpaceChildSummaries: mocks.getSpaceChildSummaries,
}));

import { SpaceWorkspaceProvider, useSpaceWorkspaceContext } from './SpaceWorkspaceContext';
import { useSpaceWorkspace } from './useSpaceWorkspace';

type Listener = (...args: unknown[]) => void;

const childEvent = (childId: string): MatrixEvent => ({
    getStateKey: () => childId,
    getContent: () => ({ via: ['example.org'] }),
}) as unknown as MatrixEvent;

interface RoomOptions {
    space?: boolean;
    children?: string[];
    membership?: string;
    timestamp?: number;
    unread?: number;
    memberCount?: number;
    avatarUrl?: string | null;
}

const makeRoom = (
    roomId: string,
    name: string,
    options: RoomOptions = {},
): Room => ({
    roomId,
    name,
    isSpaceRoom: () => options.space === true,
    getMyMembership: () => options.membership ?? 'join',
    getLastActiveTimestamp: () => options.timestamp ?? 0,
    getRoomUnreadNotificationCount: (type: NotificationCountType) => (
        type === NotificationCountType.Total ? options.unread ?? 0 : 0
    ),
    getJoinedMemberCount: () => options.memberCount ?? 0,
    getMxcAvatarUrl: () => options.avatarUrl ?? null,
    currentState: {
        getStateEvents: (eventType: string) => (
            eventType === EventType.SpaceChild
                ? (options.children ?? []).map(childEvent)
                : []
        ),
    },
} as unknown as Room);

const summary = (
    name: string,
    options: Partial<SpaceChildSummary> = {},
): SpaceChildSummary => ({
    name,
    avatarUrl: null,
    roomType: null,
    joinRule: null,
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 0,
    ...options,
});

const setup = (rooms: Room[]) => {
    const listeners = new Map<string, Set<Listener>>();
    const client = {
        getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
        on: vi.fn((event: string, listener: Listener) => {
            const eventListeners = listeners.get(event) ?? new Set<Listener>();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
        }),
        off: vi.fn((event: string, listener: Listener) => {
            listeners.get(event)?.delete(listener);
        }),
    } as unknown as MatrixClient;
    mocks.getClient.mockReturnValue(client);
    mocks.getSpaceChildSummaries.mockResolvedValue(new Map());

    return {
        emit: (event: string, ...args: unknown[]) => {
            listeners.get(event)?.forEach((listener) => listener(...args));
        },
    };
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

describe('useSpaceWorkspace', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('keeps every direct edge while joinedRooms contains only joined non-Space rooms', async () => {
        const joined = makeRoom('!joined:example.org', 'General', {
            unread: 2,
            timestamp: 20,
            memberCount: 3,
        });
        const unjoined = makeRoom('!unjoined:example.org', 'Archive', {
            membership: 'leave',
            unread: 9,
            timestamp: 99,
        });
        const nested = makeRoom('!nested:example.org', 'Engineering', { space: true });
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: [joined.roomId, unjoined.roomId, '!unknown:example.org', nested.roomId],
        });
        setup([space, joined, unjoined, nested]);
        mocks.getSpaceChildSummaries.mockResolvedValue(new Map([
            [joined.roomId, summary('Server name', { memberCount: 100 })],
            ['!unknown:example.org', summary('Public room', { memberCount: 12 })],
        ]));

        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));

        expect(result.current.space).toBe(space);
        expect(result.current.unavailable).toBe(false);
        expect(result.current.items.map((item) => item.roomId).sort()).toEqual([
            joined.roomId,
            nested.roomId,
            unjoined.roomId,
            '!unknown:example.org',
        ].sort());
        expect(result.current.joinedRooms.map((item) => item.roomId)).toEqual([joined.roomId]);

        await waitFor(() => expect(
            result.current.items.find((item) => item.roomId === '!unknown:example.org')?.name,
        ).toBe('Public room'));

        expect(result.current.items.find((item) => item.roomId === joined.roomId)).toMatchObject({
            kind: 'room',
            name: 'General',
            memberCount: 3,
            unread: 2,
            lastActivityTs: 20,
            joined: true,
            noAccess: false,
        });
        expect(result.current.items.find((item) => item.roomId === unjoined.roomId)).toMatchObject({
            unread: 0,
            lastActivityTs: 0,
            joined: false,
        });
        expect(result.current.items.find((item) => item.roomId === nested.roomId)).toMatchObject({
            kind: 'space',
            joined: true,
        });
        expect(result.current.items.find((item) => item.roomId === '!unknown:example.org')).toMatchObject({
            room: null,
            kind: 'room',
            memberCount: 12,
            joined: false,
            noAccess: false,
        });
    });

    it('identifies an unknown nested Space from its hierarchy summary', async () => {
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: ['!nested:example.org'],
        });
        setup([space]);
        mocks.getSpaceChildSummaries.mockResolvedValue(new Map([
            ['!nested:example.org', summary('Engineering', { roomType: RoomType.Space })],
        ]));

        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));

        await waitFor(() => expect(result.current.items[0]).toMatchObject({
            roomId: '!nested:example.org',
            kind: 'space',
            name: 'Engineering',
            joined: false,
        }));
    });

    it('keeps synchronized fallback rows when summary enrichment fails', async () => {
        const joined = makeRoom('!joined:example.org', 'General');
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: [joined.roomId, '!unknown:example.org'],
        });
        setup([space, joined]);
        mocks.getSpaceChildSummaries.mockRejectedValue(new Error('forbidden'));

        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));

        await waitFor(() => expect(result.current.enrichmentError).toBe(true));
        expect(result.current.isEnriching).toBe(false);
        expect(result.current.items).toHaveLength(2);
        expect(result.current.items.find((item) => item.roomId === '!unknown:example.org')).toMatchObject({
            room: null,
            name: '!unknown',
            noAccess: true,
        });
        expect(result.current.items.find((item) => item.roomId === joined.roomId)?.noAccess).toBe(false);
    });

    it('marks the workspace unavailable after leaving the Space', () => {
        let membership = 'join';
        const child = makeRoom('!joined:example.org', 'General');
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: [child.roomId],
        });
        space.getMyMembership = () => membership;
        const { emit } = setup([space, child]);
        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));
        expect(result.current.unavailable).toBe(false);

        membership = 'leave';
        act(() => emit(RoomEvent.MyMembership));

        expect(result.current.unavailable).toBe(true);
        expect(result.current.items).toEqual([]);
        expect(result.current.joinedRooms).toEqual([]);
    });

    it('ignores an older hierarchy response after the route Space changes', async () => {
        const oldRequest = deferred<Map<string, SpaceChildSummary>>();
        const newRequest = deferred<Map<string, SpaceChildSummary>>();
        const oldSpace = makeRoom('!old:example.org', 'Old Space', {
            space: true,
            children: ['!old-child:example.org'],
        });
        const newSpace = makeRoom('!new:example.org', 'New Space', {
            space: true,
            children: ['!new-child:example.org'],
        });
        setup([oldSpace, newSpace]);
        mocks.getSpaceChildSummaries.mockImplementation((spaceId: string) => (
            spaceId === oldSpace.roomId ? oldRequest.promise : newRequest.promise
        ));
        const { result, rerender } = renderHook(
            (spaceId: string) => useSpaceWorkspace(spaceId),
            { initialProps: oldSpace.roomId },
        );
        await waitFor(() => expect(mocks.getSpaceChildSummaries).toHaveBeenCalledWith(oldSpace.roomId));

        rerender(newSpace.roomId);
        await act(async () => {
            newRequest.resolve(new Map([['!new-child:example.org', summary('Current child')]]));
            await newRequest.promise;
        });
        await waitFor(() => expect(result.current.items[0]?.name).toBe('Current child'));

        await act(async () => {
            oldRequest.resolve(new Map([['!old-child:example.org', summary('Stale child')]]));
            await oldRequest.promise;
        });

        expect(result.current.space).toBe(newSpace);
        expect(result.current.items.map((item) => item.roomId)).toEqual(['!new-child:example.org']);
        expect(result.current.items[0].name).toBe('Current child');
    });

    it('recomputes local unread and activity from timeline updates', () => {
        let unread = 1;
        let timestamp = 10;
        const child = makeRoom('!joined:example.org', 'General');
        child.getRoomUnreadNotificationCount = () => unread;
        child.getLastActiveTimestamp = () => timestamp;
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: [child.roomId],
        });
        const { emit } = setup([space, child]);
        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));

        unread = 4;
        timestamp = 50;
        act(() => emit(RoomEvent.Timeline));

        expect(result.current.joinedRooms[0]).toMatchObject({ unread: 4, lastActivityTs: 50 });
    });

    it('refreshes after prepared sync and removes the registered listeners on unmount', () => {
        const space = makeRoom('!space:example.org', 'Company', { space: true });
        const { emit } = setup([space]);
        const { result, unmount } = renderHook(() => useSpaceWorkspace(space.roomId));
        const client = mocks.getClient.mock.results.at(-1)?.value as MatrixClient;
        const registeredListeners = vi.mocked(client.on).mock.calls;

        act(() => emit(ClientEvent.Sync, SyncState.Prepared));
        expect(result.current.space).toBe(space);
        unmount();

        expect(vi.mocked(client.off).mock.calls).toEqual(registeredListeners.slice(-6));
    });

    it.each([
        ClientEvent.Room,
        RoomEvent.MyMembership,
        RoomStateEvent.Events,
        MatrixEventEvent.Decrypted,
    ])('recomputes local room data after %s', (event) => {
        const child = makeRoom('!joined:example.org', 'Before');
        const space = makeRoom('!space:example.org', 'Company', {
            space: true,
            children: [child.roomId],
        });
        const { emit } = setup([space, child]);
        const { result } = renderHook(() => useSpaceWorkspace(space.roomId));

        child.name = 'After';
        act(() => emit(event));

        expect(result.current.joinedRooms[0].name).toBe('After');
    });

    it('shares the route-scoped model through the provider', async () => {
        const space = makeRoom('!space:example.org', 'Company', { space: true });
        setup([space]);
        const Consumer = () => {
            const model = useSpaceWorkspaceContext();
            return <span>{model.space?.name}:{String(model.isEnriching)}</span>;
        };

        render(
            <SpaceWorkspaceProvider spaceId={space.roomId}>
                <Consumer />
            </SpaceWorkspaceProvider>,
        );

        expect(await screen.findByText('Company:false')).not.toBeNull();
    });
});
