// Пространства (spaces): создание, добавление комнат, информация о детях.
import { EventType } from 'matrix-js-sdk';
import { RoomType } from 'matrix-js-sdk';
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

export interface SpaceChildInfo {
    roomId: string;
    name: string | null;
    avatarUrl: string | null;
    joined: boolean;
}

// summary не-joined ребёнка пространства: имя/аватар с сервера
export const getRoomSummary = async (
    roomId: string,
    via: string[],
): Promise<{ name: string | null; avatar_url: string | null }> => {
    const client = getClient();
    const summary = await client.getRoomSummary(roomId, via);
    return { name: summary.name ?? null, avatar_url: summary.avatar_url ?? null };
};
