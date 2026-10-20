// Пространства (spaces): создание, добавление комнат, иерархия детей.
import { EventType } from 'matrix-js-sdk';
import { RoomType } from 'matrix-js-sdk';
// IHierarchyRoom из корня matrix-js-sdk не экспортируется (там он переименован
// в HierarchyRoom) — берём из типа SDK напрямую, имя сохраняем каноничным
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import { getClient, MATRIX_HOMESERVER_URL } from '../client';

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
    // via — серверы, через которые можно резолвить ребёнка (спека spaces)
    const via = [new URL(MATRIX_HOMESERVER_URL).hostname];
    await client.sendStateEvent(spaceId, EventType.SpaceChild, { via }, roomId);
};

export interface ChildSummary {
    name: string | null;
    avatarUrl: string | null;
}

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
        });
    }
    return result;
};

// один запрос на пространство; maxDepth = 1 — вложенные пространства
// мы и так не показываем
export const getSpaceChildSummaries = async (
    spaceId: string,
): Promise<Map<string, ChildSummary>> => {
    const { rooms } = await getClient().getRoomHierarchy(spaceId, 50, 1);
    return toChildSummaries(spaceId, rooms);
};
