// Комнаты: поиск по директории, вступление, создание чатов/групп/каналов.
import { EventType, Preset, Visibility } from 'matrix-js-sdk';
import type { IPublicRoomsChunkRoom, MatrixClient, Room } from 'matrix-js-sdk';
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

// Канонический список DM хранится в глобальном account data m.direct.
const getDirectRoomIds = (client: MatrixClient, userId: string): string[] => {
    const content = client
        .getAccountData(EventType.Direct)
        ?.getContent<Record<string, string[]>>();
    const roomIds = content?.[userId];
    return Array.isArray(roomIds) ? roomIds : [];
};

const findExistingDirectChat = (client: MatrixClient, userId: string): string | null => {
    for (const roomId of getDirectRoomIds(client, userId)) {
        const room = client.getRoom(roomId);
        if (room?.getMyMembership() === 'join') return roomId;
    }

    // Fallback для комнат, созданных до записи m.direct: is_direct живёт
    // на invite member-события и сохраняется SDK в prev_content при join.
    const myUserId = client.getUserId();
    const room = client.getRooms().find((candidate) => {
        if (candidate.getMyMembership() !== 'join') return false;
        const invitedMe = myUserId
            ? candidate.getMember(myUserId)?.getDMInviter() === userId
            : false;
        const invitedByMe = myUserId
            ? candidate.getMember(userId)?.getDMInviter() === myUserId
            : false;
        return invitedMe || invitedByMe;
    });
    return room?.roomId ?? null;
};

// личный чат: сначала переиспользуем существующий DM, иначе создаём
// приватную зашифрованную комнату и связываем её с пользователем в m.direct.
export const createDirectChat = async (userId: string): Promise<string> => {
    const client = getClient();
    const existingRoomId = findExistingDirectChat(client, userId);
    if (existingRoomId) return existingRoomId;

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

    try {
        const current = client
            .getAccountData(EventType.Direct)
            ?.getContent<Record<string, string[]>>() ?? {};
        await client.setAccountData(EventType.Direct, {
            ...current,
            [userId]: [...new Set([...getDirectRoomIds(client, userId), room_id])],
        });
    } catch (error) {
        // Комната уже создана: не заставляем пользователя создавать дубликат
        // из-за ошибки вторичной записи account data. Fallback по is_direct
        // всё равно позволит найти её при следующем открытии.
        console.warn('Direct chat created, but m.direct could not be updated', error);
    }
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
        // В отличие от обычной публичной комнаты, писать в канал могут
        // только администраторы (power level 100). Реакции не ограничиваем.
        power_level_content_override: {
            events: { [EventType.RoomMessage]: 100 },
        },
    });
    return room_id;
};
