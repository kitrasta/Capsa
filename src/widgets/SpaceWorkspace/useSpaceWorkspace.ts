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
    getSpaceChildSummaries,
    type SpaceChildSummary,
} from '../../shared/lib/matrix';

export interface SpaceWorkspaceItem {
    roomId: string;
    room: Room | null;
    kind: 'space' | 'room';
    name: string;
    avatarUrl: string | null;
    memberCount: number;
    unread: number;
    lastActivityTs: number;
    joined: boolean;
    noAccess: boolean;
}

export interface SpaceWorkspaceModel {
    space: Room | null;
    items: SpaceWorkspaceItem[];
    joinedRooms: SpaceWorkspaceItem[];
    isEnriching: boolean;
    enrichmentError: boolean;
    unavailable: boolean;
}

interface EnrichmentResult {
    spaceId: string;
    childSignature: string;
    summaries: Map<string, SpaceChildSummary> | null;
    error: boolean;
}

const fallbackName = (roomId: string): string => roomId.split(':')[0];

const compareItems = (a: SpaceWorkspaceItem, b: SpaceWorkspaceItem): number => {
    if (a.joined !== b.joined) return a.joined ? -1 : 1;
    if (a.joined) {
        return b.lastActivityTs - a.lastActivityTs || a.name.localeCompare(b.name, 'ru');
    }
    return a.name.localeCompare(b.name, 'ru');
};

export const useSpaceWorkspace = (spaceId: string): SpaceWorkspaceModel => {
    const client = getClient();
    const [, setVersion] = useState(0);
    const requestGeneration = useRef(0);
    const [enrichmentResult, setEnrichmentResult] = useState<EnrichmentResult | null>(null);

    const space = client.getRoom(spaceId);
    const available = space?.isSpaceRoom() === true && space.getMyMembership() === 'join';
    const directChildIds = available ? getDirectSpaceChildIds(space) : [];
    const childSignature = [...directChildIds].sort().join('\0');

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

    useEffect(() => {
        const generation = ++requestGeneration.current;
        let active = true;
        if (!available) return;

        getSpaceChildSummaries(spaceId)
            .then((summaries) => {
                if (!active || generation !== requestGeneration.current) return;
                setEnrichmentResult({ spaceId, childSignature, summaries, error: false });
            })
            .catch(() => {
                if (!active || generation !== requestGeneration.current) return;
                setEnrichmentResult({ spaceId, childSignature, summaries: null, error: true });
            });

        return () => {
            active = false;
        };
    }, [spaceId, available, childSignature]);

    const currentResult = enrichmentResult?.spaceId === spaceId
        && enrichmentResult.childSignature === childSignature
        ? enrichmentResult
        : null;
    const isEnriching = available && currentResult === null;
    const enrichmentError = currentResult?.error ?? false;
    const summaries = currentResult?.summaries ?? null;
    const items: SpaceWorkspaceItem[] = [];

    for (const roomId of directChildIds) {
        const room = client.getRoom(roomId);
        const summary = summaries?.get(roomId) ?? null;
        const joined = room?.getMyMembership() === 'join';
        items.push({
            roomId,
            room,
            kind: room?.isSpaceRoom() || summary?.roomType === RoomType.Space ? 'space' : 'room',
            name: room?.name || summary?.name || fallbackName(roomId),
            avatarUrl: room?.getMxcAvatarUrl() ?? summary?.avatarUrl ?? null,
            memberCount: room?.getJoinedMemberCount() ?? summary?.memberCount ?? 0,
            unread: joined
                ? room.getRoomUnreadNotificationCount(NotificationCountType.Total) ?? 0
                : 0,
            lastActivityTs: joined ? room.getLastActiveTimestamp() : 0,
            joined,
            noAccess: !room && !summary && !isEnriching,
        });
    }

    items.sort(compareItems);
    return {
        space,
        items,
        joinedRooms: items.filter((item) => item.kind === 'room' && item.joined),
        isEnriching,
        enrichmentError,
        unavailable: !available,
    };
};
