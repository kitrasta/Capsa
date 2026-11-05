import { useEffect, useRef, useState } from 'react';
import {
    ClientEvent,
    MatrixEventEvent,
    NotificationCountType,
    RoomEvent,
    RoomStateEvent,
    RoomType,
    SyncState,
} from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import {
    getClient,
    getDirectSpaceChildIds,
    getJoinedSpaceRoots,
    getSpaceChildSummaries,
    type SpaceChildSummary,
} from '../../../shared/lib/matrix';

export interface SpaceFolderSpaceView {
    kind: 'space';
    roomId: string;
    room: Room | null;
    name: string;
    avatarUrl: string | null;
    canOpen: boolean;
    noAccess: boolean;
}

export interface SpaceFolderRoomView {
    kind: 'room';
    roomId: string;
    room: Room | null;
    name: string;
    avatarUrl: string | null;
    noAccess: boolean;
}

const fallbackName = (roomId: string): string => roomId.split(':')[0];

export const useSpaceFolders = () => {
    const client = getClient();
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
        client.on(RoomEvent.MyMembership, refresh);
        client.on(RoomEvent.Timeline, refresh);
        client.on(MatrixEventEvent.Decrypted, refresh);
        client.on(RoomStateEvent.Events, refresh);
        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, refresh);
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
    // Если текущий Space исчез из store, без дополнительного effect показываем «Все».
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
    const spaces: SpaceFolderSpaceView[] = [];
    const rooms: SpaceFolderRoomView[] = [];

    const sourceIds = currentSpace
        ? directChildIds
        : client.getRooms()
            .filter((room) => room.getMyMembership() === 'join' && !room.isSpaceRoom())
            .map((room) => room.roomId);

    for (const roomId of sourceIds) {
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
            spaces.push({
                ...common,
                kind: 'space',
                canOpen: room?.getMyMembership() === 'join',
            });
        } else {
            rooms.push({ ...common, kind: 'room' });
        }
    }

    spaces.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    rooms.sort((a, b) => {
        if (a.room && b.room) {
            return b.room.getLastActiveTimestamp() - a.room.getLastActiveTimestamp();
        }
        if (a.room) return -1;
        if (b.room) return 1;
        return a.name.localeCompare(b.name, 'ru');
    });

    const unreadBySpace = new Map<string, number>();
    for (const root of roots) {
        const unread = getDirectSpaceChildIds(root).reduce((total, roomId) => {
            const room = client.getRoom(roomId);
            if (!room || room.isSpaceRoom() || room.getMyMembership() !== 'join') return total;
            return total + room.getRoomUnreadNotificationCount(NotificationCountType.Total);
        }, 0);
        unreadBySpace.set(root.roomId, unread);
    }

    return {
        roots,
        path,
        currentSpace,
        spaces,
        rooms,
        unreadBySpace,
        isEnriching,
        enrichmentError,
        openRoot: (roomId: string) => setPathIds([roomId]),
        openChild: (roomId: string) => {
            if (pathIds.includes(roomId)) return;
            if (client.getRoom(roomId)?.getMyMembership() !== 'join') return;
            setPathIds((current) => [...current, roomId]);
        },
        openBreadcrumb: (index: number) => setPathIds((current) => current.slice(0, index + 1)),
        showAll: () => setPathIds([]),
    };
};
