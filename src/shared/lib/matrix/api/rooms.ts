// Комнаты: поиск по директории, вступление, создание чатов/групп/каналов.
import { Preset, Visibility } from 'matrix-js-sdk';
import type { IPublicRoomsChunkRoom, Room } from 'matrix-js-sdk';
import { getClient } from '../client';

export const searchPublicRooms = async (
    query: string
): Promise<IPublicRoomsChunkRoom[]> => {
    const client = getClient();
    const response = await client.publicRooms({
        limit: 20,
        filter: {
            generic_search_term: query
        }
    });
    return response.chunk;
}

export const joinRoom = async (roomId: string): Promise<Room> => {
    const client = getClient();
    return client.joinRoom(roomId)
}

// личный чат: приватная зашифрованная комната с приглашением одного юзера
export const createDirectChat = async (userId: string): Promise<string> => {
    const client = getClient();
    const { room_id } = await client.createRoom({
        invite: [userId],
        is_direct: true,
        preset: Preset.TrustedPrivateChat,
        // включаем megolm-шифрование с момента создания:
        // все сообщения этой комнаты уходят зашифрованными
        initial_state: [{
            type: 'm.room.encryption',
            state_key: '',
            content: {
                algorithm: 'm.megolm.v1.aes-sha2',
            },
        }],
    });
    return room_id;
}

// группа: приватная комната со списком приглашённых (можно пустым)
export const createGroup = async (
    name: string,
    invite: string[],
): Promise<string> => {
    const client = getClient();
    const { room_id } = await client.createRoom({
        name,
        invite,
        preset: Preset.PrivateChat,
    });
    return room_id;
};

// канал: публичная комната, в неё вступают сами
export const createChannel = async (
    name: string,
    topic?: string,
): Promise<string> => {
    const client = getClient();
    const { room_id } = await client.createRoom({
        name,
        topic,
        visibility: Visibility.Public,
        preset: Preset.PublicChat,
    });
    return room_id;
};
