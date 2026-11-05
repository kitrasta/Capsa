import { useEffect, useRef, useState } from 'react';
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
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
    getClient,
    getDirectSpaceChildIds,
    getJoinedSpaceRoots,
    getSpaceChildSummaries,
    type SpaceChildSummary,
} from '../../../shared/lib/matrix';

export type SpaceFolderFilter = 'all' | 'unread' | 'direct';

export interface SpaceFolderSpaceView {
    kind: 'space';
    roomId: string;
    room: Room | null;
    name: string;
    avatarUrl: string | null;
    unread: number;
    lastActivityTs: number;
    canOpen: boolean;
    noAccess: boolean;
}

export interface SpaceFolderRoomView {
    kind: 'room';
    roomId: string;
    room: Room | null;
    name: string;
    avatarUrl: string | null;
    unread: number;
    lastActivityTs: number;
    noAccess: boolean;
}

export type SpaceFolderItem = SpaceFolderSpaceView | SpaceFolderRoomView;

const fallbackName = (roomId: string): string => roomId.split(':')[0];

const isJoined = (room: Room | null): room is Room => room?.getMyMembership() === 'join';

const compareItems = (a: SpaceFolderItem, b: SpaceFolderItem): number => {
    const aJoined = isJoined(a.room);
    const bJoined = isJoined(b.room);
    if (aJoined && bJoined) {
        return b.lastActivityTs - a.lastActivityTs || a.name.localeCompare(b.name, 'ru');
    }
    if (aJoined) return -1;
    if (bJoined) return 1;
    return a.name.localeCompare(b.name, 'ru');
};

const getSpaceAggregate = (space: Room, client: MatrixClient) => {
    const visitedSpaces = new Set<string>();
    const visitedRooms = new Set<string>();
    let unread = 0;
    let lastActivityTs = 0;

    const visit = (current: Room) => {
        if (visitedSpaces.has(current.roomId)) return;
        visitedSpaces.add(current.roomId);

        for (const childId of getDirectSpaceChildIds(current)) {
            const child = client.getRoom(childId);
            if (!isJoined(child)) continue;
            if (child.isSpaceRoom()) {
                visit(child);
                continue;
            }
            if (visitedRooms.has(child.roomId)) continue;
            visitedRooms.add(child.roomId);
            unread += child.getRoomUnreadNotificationCount(NotificationCountType.Total) ?? 0;
            lastActivityTs = Math.max(lastActivityTs, child.getLastActiveTimestamp());
        }
    };

    visit(space);
    return { unread, lastActivityTs };
};

const getDirectRoomIds = (client: MatrixClient): Set<string> => {
    const content = client.getAccountData(EventType.Direct)?.getContent<Record<string, unknown>>();
    if (!content || typeof content !== 'object' || Array.isArray(content)) return new Set();

    const roomIds = new Set<string>();
    for (const value of Object.values(content)) {
        if (!Array.isArray(value)) continue;
        for (const roomId of value) {
            if (typeof roomId === 'string') roomIds.add(roomId);
        }
    }
    return roomIds;
};

const isDirectRoom = (room: Room, client: MatrixClient, directRoomIds: ReadonlySet<string>) => {
    if (directRoomIds.has(room.roomId)) return true;

    const myUserId = client.getUserId();
    if (!myUserId) return false;
    if (room.getMember(myUserId)?.getDMInviter()) return true;
    return room.getMembers().some(
        (member) => member.userId !== myUserId && member.getDMInviter() === myUserId,
    );
};

export const useSpaceFolders = () => {
    const client = getClient();
    const [filter, setFilter] = useState<SpaceFolderFilter>('all');
    const [pathIds, setPathIds] = useState<string[]>([]);
    const [, setVersion] = useState(0);
    const [summaryCache, setSummaryCache] = useState<
        Record<string, Map<string, SpaceChildSummary>>
    >({});
    const [requestResult, setRequestResult] = useState<{
        spaceId: string;
        error: boolean;
    } | null>(null);
    const requestVersion = useRef(0);

    useEffect(() => {
        const refresh = () => setVersion((value) => value + 1);
        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared) refresh();
        };
        client.on(ClientEvent.Sync, handleSync);
        client.on(ClientEvent.Room, refresh);
        client.on(ClientEvent.AccountData, refresh);
        client.on(RoomEvent.MyMembership, refresh);
        client.on(RoomEvent.Timeline, refresh);
        client.on(MatrixEventEvent.Decrypted, refresh);
        client.on(RoomStateEvent.Events, refresh);
        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, refresh);
            client.off(ClientEvent.AccountData, refresh);
            client.off(RoomEvent.MyMembership, refresh);
            client.off(RoomEvent.Timeline, refresh);
            client.off(MatrixEventEvent.Decrypted, refresh);
            client.off(RoomStateEvent.Events, refresh);
        };
    }, [client]);

    const roots = getJoinedSpaceRoots(client);
    const resolvedPath = pathIds
        .map((roomId) => client.getRoom(roomId))
        .filter((room): room is Room => room !== null && room.isSpaceRoom());
    // Если текущий Space исчез из store, без дополнительного effect показываем корень.
    const path = resolvedPath.length === pathIds.length ? resolvedPath : [];
    const currentSpace = path[path.length - 1] ?? null;
    const currentId = currentSpace?.roomId ?? null;

    useEffect(() => {
        requestVersion.current += 1;
        if (!currentId) return;

        const request = requestVersion.current;
        getSpaceChildSummaries(currentId)
            .then((summaries) => {
                if (request !== requestVersion.current) return;
                setSummaryCache((cache) => ({ ...cache, [currentId]: summaries }));
                setRequestResult({ spaceId: currentId, error: false });
            })
            .catch(() => {
                if (request === requestVersion.current) {
                    setRequestResult({ spaceId: currentId, error: true });
                }
            });
    }, [currentId]);

    const summaries = currentId ? summaryCache[currentId] : undefined;
    const requestSettled = requestResult?.spaceId === currentId;
    const enrichmentError = requestSettled && requestResult.error;
    const isEnriching = currentId !== null && !summaries && !requestSettled;
    const directChildIds = currentSpace ? getDirectSpaceChildIds(currentSpace) : [];
    const directRoomIds = filter === 'direct' ? getDirectRoomIds(client) : new Set<string>();
    const joinedSpaces = client.getRooms().filter(
        (room) => room.isSpaceRoom() && isJoined(room),
    );
    const groupedRoomIds = new Set(joinedSpaces.flatMap(getDirectSpaceChildIds));
    const allSpaces: SpaceFolderSpaceView[] = [];
    const allRooms: SpaceFolderRoomView[] = [];

    const sourceIds = filter === 'direct'
        ? client.getRooms()
            .filter((room) => isJoined(room) && !room.isSpaceRoom())
            .map((room) => room.roomId)
        : currentSpace
          ? directChildIds
          : [
            ...roots.map((room) => room.roomId),
            ...client.getRooms()
                .filter((room) => {
                    if (!isJoined(room) || room.isSpaceRoom()) return false;
                    // Ветка 'direct' выбрала sourceIds выше — здесь её проверка мертва.
                    return !groupedRoomIds.has(room.roomId);
                })
                .map((room) => room.roomId),
        ];

    for (const roomId of new Set(sourceIds)) {
        const room = client.getRoom(roomId);
        const summary = summaries?.get(roomId) ?? null;
        const isSpace = room?.isSpaceRoom() ?? summary?.roomType === RoomType.Space;
        const noAccess = !room && !summary && !isEnriching;
        const common = {
            roomId,
            room,
            name: room?.name || summary?.name || fallbackName(roomId),
            avatarUrl: room?.getMxcAvatarUrl() ?? summary?.avatarUrl ?? null,
            noAccess,
        };
        if (isSpace) {
            const aggregate = room && isJoined(room)
                ? getSpaceAggregate(room, client)
                : { unread: 0, lastActivityTs: 0 };
            allSpaces.push({
                ...common,
                ...aggregate,
                kind: 'space',
                canOpen: isJoined(room),
            });
        } else {
            allRooms.push({
                ...common,
                kind: 'room',
                unread: isJoined(room)
                    ? room.getRoomUnreadNotificationCount(NotificationCountType.Total) ?? 0
                    : 0,
                lastActivityTs: isJoined(room) ? room.getLastActiveTimestamp() : 0,
            });
        }
    }

    const spaces = allSpaces
        .filter((space) => filter === 'all' || (filter === 'unread' && space.unread > 0))
        .sort(compareItems);
    const rooms = allRooms
        .filter((view) => {
            if (filter === 'all') return true;
            if (!isJoined(view.room)) return false;
            if (filter === 'unread') return view.unread > 0;
            return isDirectRoom(view.room, client, directRoomIds);
        })
        .sort(compareItems);
    const items = filter === 'direct'
        ? rooms
        : [...spaces, ...rooms].sort(compareItems);

    return {
        filter,
        path,
        currentSpace,
        items,
        spaces,
        rooms,
        isEnriching,
        enrichmentError,
        setFilter,
        openSpace: (roomId: string) => {
            const room = client.getRoom(roomId);
            if (!room?.isSpaceRoom() || !isJoined(room)) return;
            setPathIds((current) => current.includes(roomId) ? current : [...current, roomId]);
        },
        openBreadcrumb: (index: number) => setPathIds((current) => current.slice(0, index + 1)),
        showAll: () => setPathIds([]),
    };
};
