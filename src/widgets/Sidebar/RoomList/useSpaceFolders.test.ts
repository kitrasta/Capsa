// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ClientEvent, EventType, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
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

interface RoomOptions {
    space?: boolean;
    children?: string[];
    membership?: string;
    timestamp?: number;
    unread?: number;
    members?: Record<string, string | null>;
}

const makeRoom = (
    roomId: string,
    name: string,
    options: RoomOptions = {},
): Room => {
    const members = Object.fromEntries(
        Object.entries(options.members ?? {}).map(([userId, inviter]) => [
            userId,
            { userId, getDMInviter: () => inviter } as unknown as RoomMember,
        ]),
    );

    return {
        roomId,
        name,
        isSpaceRoom: () => options.space === true,
        getMyMembership: () => options.membership ?? 'join',
        getLastActiveTimestamp: () => options.timestamp ?? 0,
        getRoomUnreadNotificationCount: () => options.unread ?? 0,
        getMxcAvatarUrl: () => null,
        getMember: (userId: string) => members[userId],
        getMembers: () => Object.values(members),
        currentState: {
            getStateEvents: () => (options.children ?? []).map(childEvent),
        },
    } as unknown as Room;
};

const summary = (name: string, roomType: string | null = null): SpaceChildSummary => ({
    name,
    avatarUrl: null,
    roomType,
    joinRule: null,
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 0,
});

const setup = (
    rooms: Room[],
    directContent: unknown = {},
) => {
    const listeners = new Map<string, () => void>();
    const client = {
        getRooms: () => rooms,
        getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
        getUserId: () => '@me:example.org',
        getAccountData: (eventType: string) => eventType === EventType.Direct
            ? { getContent: () => directContent }
            : null,
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

    it('показывает в корне joined root Spaces и негруппированные комнаты без дубликатов', () => {
        const grouped = makeRoom('!grouped:example.org', 'Сгруппированная', { timestamp: 20 });
        const outside = makeRoom('!outside:example.org', 'Вне папки', { timestamp: 30 });
        const unjoinedSpaceRoom = makeRoom('!unjoined-child:example.org', 'Доступная без папки', {
            timestamp: 10,
        });
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [grouped.roomId],
        });
        const secondRoot = makeRoom('!second:example.org', 'Команда', {
            space: true,
            children: [grouped.roomId],
        });
        const unjoinedSpace = makeRoom('!unjoined-space:example.org', 'Чужая папка', {
            space: true,
            membership: 'leave',
            children: [unjoinedSpaceRoom.roomId],
        });
        setup([root, secondRoot, unjoinedSpace, grouped, outside, unjoinedSpaceRoom]);

        const { result } = renderHook(() => useSpaceFolders());

        expect(result.current.filter).toBe('all');
        expect(result.current.path).toEqual([]);
        expect(result.current.spaces.map((space) => space.roomId)).toEqual([
            secondRoot.roomId,
            root.roomId,
        ]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            outside.roomId,
            unjoinedSpaceRoom.roomId,
        ]);
        expect(result.current.items.map((item) => item.roomId)).toEqual([
            outside.roomId,
            secondRoot.roomId,
            root.roomId,
            unjoinedSpaceRoom.roomId,
        ]);
    });

    it('открывает один уровень, сохраняет фактический путь и возвращается по breadcrumb', async () => {
        const joined = makeRoom('!joined:example.org', 'Общий', { timestamp: 20 });
        const outside = makeRoom('!outside:example.org', 'Вне папки', { timestamp: 30 });
        const nested = makeRoom('!nested:example.org', 'Разработка', {
            space: true,
            children: [joined.roomId],
        });
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [nested.roomId],
        });
        setup([nested, joined, outside, root]);
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openSpace(root.roomId));

        expect(result.current.spaces.map((space) => space.roomId)).toEqual([nested.roomId]);
        expect(result.current.rooms).toEqual([]);
        expect(result.current.rooms.some((room) => room.roomId === outside.roomId)).toBe(false);
        await waitFor(() => expect(mocks.getSpaceChildSummaries).toHaveBeenCalledWith(root.roomId));

        act(() => result.current.openSpace(nested.roomId));
        expect(result.current.path.map((room) => room.roomId)).toEqual([root.roomId, nested.roomId]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([joined.roomId]);

        act(() => result.current.openSpace(root.roomId));
        expect(result.current.path).toHaveLength(2);

        act(() => result.current.openBreadcrumb(0));
        expect(result.current.path.map((room) => room.roomId)).toEqual([root.roomId]);

        act(() => result.current.showAll());
        expect(result.current.path).toEqual([]);
    });

    it('сбрасывает путь к корню после выхода из открытого Space', () => {
        let membership: 'join' | 'leave' = 'join';
        const child = makeRoom('!child:example.org', 'Дочерняя');
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [child.roomId],
        });
        root.getMyMembership = () => membership;
        const { emit } = setup([root, child]);
        const { result } = renderHook(() => useSpaceFolders());
        act(() => result.current.openSpace(root.roomId));
        expect(result.current.path.map((room) => room.roomId)).toEqual([root.roomId]);

        membership = 'leave';
        act(() => emit(RoomEvent.MyMembership));

        expect(result.current.path).toEqual([]);
        expect(result.current.currentSpace).toBeNull();
        expect(result.current.spaces).toEqual([]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([child.roomId]);
    });

    it('агрегирует unread и активность рекурсивно, переживает циклы и обновления вне экрана', () => {
        let unread = 0;
        let timestamp = 10;
        const deepRoom = makeRoom('!deep-room:example.org', 'Глубокая');
        deepRoom.getRoomUnreadNotificationCount = () => unread;
        deepRoom.getLastActiveTimestamp = () => timestamp;
        const nested = makeRoom('!nested:example.org', 'Вложенная', {
            space: true,
            children: [deepRoom.roomId, '!root:example.org'],
        });
        const root = makeRoom('!root:example.org', 'Корневая', {
            space: true,
            children: [nested.roomId],
        });
        const visible = makeRoom('!visible:example.org', 'Видимая');
        const { emit } = setup([root, nested, deepRoom, visible]);
        const { result } = renderHook(() => useSpaceFolders());

        expect(result.current.spaces[0]).toMatchObject({ unread: 0, lastActivityTs: 10 });

        unread = 3;
        timestamp = 40;
        act(() => emit(RoomEvent.Timeline));

        expect(result.current.spaces[0]).toMatchObject({ unread: 3, lastActivityTs: 40 });
        act(() => result.current.setFilter('unread'));
        expect(result.current.filter).toBe('unread');
        expect(result.current.spaces.map((space) => space.roomId)).toEqual([root.roomId]);
        expect(result.current.rooms).toEqual([]);

        act(() => result.current.openSpace(root.roomId));
        expect(result.current.spaces.map((space) => space.roomId)).toEqual([nested.roomId]);
        expect(result.current.spaces[0].unread).toBe(3);
    });

    it('в фильтре Новые оставляет только joined unread rooms и контейнеры с unread descendants', () => {
        const unreadRoom = makeRoom('!unread:example.org', 'Новая', { unread: 2 });
        const readRoom = makeRoom('!read:example.org', 'Прочитанная');
        const unjoinedUnread = makeRoom('!unjoined:example.org', 'Непрочитанная чужая', {
            membership: 'leave',
            unread: 8,
        });
        const nestedRoom = makeRoom('!nested-room:example.org', 'Вложенная новая', { unread: 1 });
        const nested = makeRoom('!nested:example.org', 'Вложенный Space', {
            space: true,
            children: [nestedRoom.roomId],
        });
        const root = makeRoom('!root:example.org', 'Корневой Space', {
            space: true,
            children: [nested.roomId],
        });
        setup([unreadRoom, readRoom, unjoinedUnread, nestedRoom, nested, root]);
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.setFilter('unread'));

        expect(result.current.spaces.map((space) => space.roomId)).toEqual([root.roomId]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([unreadRoom.roomId]);
    });

    it('в Личные показывает плоский список joined DM по m.direct и DM-inviter fallback', () => {
        const canonical = makeRoom('!canonical:example.org', 'Canonical DM');
        const invitedMe = makeRoom('!invited-me:example.org', 'Invited me', {
            members: { '@me:example.org': '@alice:example.org' },
        });
        const invitedByMe = makeRoom('!invited-by-me:example.org', 'Invited by me', {
            members: { '@bob:example.org': '@me:example.org' },
        });
        const regular = makeRoom('!regular:example.org', 'Обычная');
        const leftDirect = makeRoom('!left:example.org', 'Покинутая', { membership: 'leave' });
        const space = makeRoom('!space:example.org', 'Space', {
            space: true,
            children: [canonical.roomId],
        });
        setup(
            [canonical, invitedMe, invitedByMe, regular, leftDirect, space],
            { '@alice:example.org': [canonical.roomId, leftDirect.roomId], broken: 'not-an-array' },
        );
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.setFilter('direct'));

        expect(result.current.spaces).toEqual([]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            canonical.roomId,
            invitedByMe.roomId,
            invitedMe.roomId,
        ]);
    });

    it('показывает в Личные DM внутри и вне открытого Space', () => {
        const inside = makeRoom('!inside:example.org', 'Внутри Space', { timestamp: 20 });
        const outside = makeRoom('!outside:example.org', 'Вне Space', { timestamp: 10 });
        const regular = makeRoom('!regular:example.org', 'Обычная вне Space');
        const space = makeRoom('!space:example.org', 'Space', {
            space: true,
            children: [inside.roomId],
        });
        setup(
            [inside, outside, regular, space],
            { '@alice:example.org': [inside.roomId], '@bob:example.org': [outside.roomId] },
        );
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openSpace(space.roomId));
        act(() => result.current.setFilter('direct'));

        expect(result.current.spaces).toEqual([]);
        expect(result.current.rooms.map((room) => room.roomId)).toEqual([
            inside.roomId,
            outside.roomId,
        ]);
    });

    it('переживает отсутствующий или malformed m.direct и не смешивает Личные с обычными комнатами', () => {
        const regular = makeRoom('!regular:example.org', 'Обычная');
        setup([regular], null);
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.setFilter('direct'));

        expect(result.current.spaces).toEqual([]);
        expect(result.current.rooms).toEqual([]);
    });

    it('дозагружает summary неизвестной комнаты, сохраняя её видимой во время загрузки', async () => {
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: ['!unknown:example.org'],
        });
        setup([root]);
        mocks.getSpaceChildSummaries.mockResolvedValue(new Map([
            ['!unknown:example.org', summary('Публичная')],
        ]));
        const { result } = renderHook(() => useSpaceFolders());

        act(() => result.current.openSpace(root.roomId));
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

        act(() => result.current.openSpace(root.roomId));

        await waitFor(() => expect(result.current.enrichmentError).toBe(true));
        expect(result.current.rooms).toHaveLength(1);
        expect(result.current.rooms[0].noAccess).toBe(true);
    });

    it('повторно обогащает Space после добавления неизвестного ребёнка', async () => {
        let childIds = ['!known:example.org'];
        const root = makeRoom('!root:example.org', 'Компания', { space: true });
        Object.defineProperty(root.currentState, 'getStateEvents', {
            value: () => childIds.map(childEvent),
        });
        const { emit } = setup([root]);
        mocks.getSpaceChildSummaries
            .mockResolvedValueOnce(new Map([['!known:example.org', summary('Известная')]]))
            .mockResolvedValueOnce(new Map([
                ['!known:example.org', summary('Известная')],
                ['!added:example.org', summary('Добавленная')],
            ]));
        const { result } = renderHook(() => useSpaceFolders());
        act(() => result.current.openSpace(root.roomId));
        await waitFor(() => expect(result.current.rooms[0].name).toBe('Известная'));
        expect(mocks.getSpaceChildSummaries).toHaveBeenCalledTimes(1);

        childIds = [...childIds, '!added:example.org'];
        act(() => emit(RoomStateEvent.Events));

        await waitFor(() => expect(mocks.getSpaceChildSummaries).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(
            result.current.rooms.find((room) => room.roomId === '!added:example.org'),
        ).toMatchObject({
            name: 'Добавленная',
            noAccess: false,
        }));
    });

    it('перечитывает состав после RoomStateEvent.Events', () => {
        const joined = makeRoom('!joined:example.org', 'Общий');
        const root = makeRoom('!root:example.org', 'Компания', {
            space: true,
            children: [joined.roomId],
        });
        const { emit } = setup([root, joined]);
        const { result } = renderHook(() => useSpaceFolders());
        act(() => result.current.openSpace(root.roomId));
        expect(result.current.rooms).toHaveLength(1);

        Object.defineProperty(root.currentState, 'getStateEvents', { value: () => [] });
        act(() => emit(RoomStateEvent.Events));

        expect(result.current.rooms).toEqual([]);
        expect(result.current.spaces).toEqual([]);
        expect(ClientEvent.Room).toBeTruthy();
    });
});
