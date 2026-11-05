import type { Room, RoomSummary } from 'matrix-js-sdk/lib/client';
import type { SpaceChildSummary } from './spaces';
import { getClient } from '../client';

export type RoomAccessKind =
    | 'joined'
    | 'public'
    | 'invited'
    | 'knock'
    | 'knock-pending'
    | 'invite-only'
    | 'inaccessible';

export interface RoomAccess {
    kind: RoomAccessKind;
    summary: SpaceChildSummary | null;
}

const summaryFromRemote = (summary: RoomSummary): SpaceChildSummary => ({
    name: summary.name ?? null,
    avatarUrl: summary.avatar_url ?? null,
    roomType: summary.room_type ?? null,
    joinRule: summary.join_rule ?? null,
    worldReadable: summary.world_readable === true,
    guestCanJoin: summary.guest_can_join === true,
    memberCount: summary.num_joined_members ?? 0,
});

const summaryFromRoom = (room: Room): SpaceChildSummary => ({
    name: room.name || null,
    avatarUrl: room.getMxcAvatarUrl() ?? null,
    roomType: room.isSpaceRoom() ? 'm.space' : null,
    joinRule: room.getJoinRule(),
    worldReadable: room.getHistoryVisibility() === 'world_readable',
    guestCanJoin: false,
    memberCount: room.getJoinedMemberCount(),
});

const kindFromSummary = (summary: SpaceChildSummary): RoomAccessKind => {
    if (summary.joinRule === 'public') return 'public';
    if (summary.joinRule === 'knock') return 'knock';
    return 'invite-only';
};

export const getRoomAccess = async (roomId: string): Promise<RoomAccess> => {
    const client = getClient();
    const room = client.getRoom(roomId);
    if (room) {
        const summary = summaryFromRoom(room);
        switch (room.getMyMembership()) {
            case 'join': return { kind: 'joined', summary };
            case 'invite': return { kind: 'invited', summary };
            case 'knock': return { kind: 'knock-pending', summary };
            case 'ban': return { kind: 'inaccessible', summary };
            default: return { kind: kindFromSummary(summary), summary };
        }
    }

    try {
        const domain = client.getDomain();
        const summary = summaryFromRemote(
            await client.getRoomSummary(roomId, domain ? [domain] : undefined),
        );
        return { kind: kindFromSummary(summary), summary };
    } catch {
        return { kind: 'inaccessible', summary: null };
    }
};

export const knockRoom = async (roomId: string): Promise<void> => {
    await getClient().knockRoom(roomId);
};

export const canPeekRoom = (summary: SpaceChildSummary | null): boolean =>
    summary?.worldReadable === true;
