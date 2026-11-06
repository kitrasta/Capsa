// Пространства (spaces): создание, добавление комнат, иерархия детей.
import { EventType } from 'matrix-js-sdk';
import { RoomType } from 'matrix-js-sdk';
// IHierarchyRoom из корня matrix-js-sdk не экспортируется (там он переименован
// в HierarchyRoom) — берём из типа SDK напрямую, имя сохраняем каноничным
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import { getClient } from '../client';

export const createSpace = async (name: string): Promise<string> => {
    const client = getClient();
    const { room_id } = await client.createRoom({
        name,
        creation_content: { type: RoomType.Space },
    });
    return room_id;
};

// добавить комнату в пространство: m.space.child — state-событие
// внутри самой space-комнаты, state_key = roomId ребёнка
export const addRoomToSpace = async (
    spaceId: string,
    roomId: string,
): Promise<void> => {
    const client = getClient();
    // via — server_name текущего аккаунта, а не хост API или production constant.
    const serverName = client.getDomain();
    if (!serverName) throw new Error('Не удалось определить сервер текущего аккаунта');
    await client.sendStateEvent(spaceId, EventType.SpaceChild, { via: [serverName] }, roomId);
};

export interface SpaceChildSummary {
    name: string | null;
    avatarUrl: string | null;
    roomType: string | null;
    joinRule: string | null;
    worldReadable: boolean;
    guestCanJoin: boolean;
    memberCount: number;
}

// Старое имя остаётся для совместимости с существующими импортами.
export type ChildSummary = SpaceChildSummary;

// чистая функция: ответ hierarchy → roomId → данные.
// Первым элементом сервер возвращает само пространство — его отбрасываем
export const toChildSummaries = (
    spaceId: string,
    rooms: IHierarchyRoom[],
): Map<string, ChildSummary> => {
    const result = new Map<string, ChildSummary>();
    for (const room of rooms) {
        if (room.room_id === spaceId) continue;
        result.set(room.room_id, {
            name: room.name ?? null,
            avatarUrl: room.avatar_url ?? null,
            roomType: room.room_type ?? null,
            joinRule: room.join_rule ?? null,
            worldReadable: room.world_readable === true,
            guestCanJoin: room.guest_can_join === true,
            memberCount: room.num_joined_members ?? 0,
        });
    }
    return result;
};

// один запрос на пространство; maxDepth = 1 — вложенные пространства
// мы и так не показываем
export const getSpaceChildSummaries = async (
    spaceId: string,
): Promise<Map<string, SpaceChildSummary>> => {
    const rooms: IHierarchyRoom[] = [];
    let fromToken: string | undefined;
    let pageCount = 0;

    do {
        const response = await getClient().getRoomHierarchy(
            spaceId,
            50,
            1,
            false,
            fromToken,
        );
        rooms.push(...response.rooms);
        fromToken = response.next_batch;
        pageCount += 1;
        if (pageCount >= 100 && fromToken) {
            throw new Error('Space hierarchy pagination did not finish');
        }
    } while (fromToken);

    return toChildSummaries(spaceId, rooms);
};
