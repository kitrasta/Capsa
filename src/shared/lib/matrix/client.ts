import { createClient, MemoryStore, IndexedDBStore } from 'matrix-js-sdk';
import { AllDevicesIsolationMode } from 'matrix-js-sdk/lib/crypto-api';
import type {LoginResponse, IPublicRoomsChunkRoom, Room, MatrixClient} from "matrix-js-sdk";
import type { MatrixSession } from './session';

import { Preset } from 'matrix-js-sdk';

export const MATRIX_HOMESERVER_URL = 'https://matrix.org';

let client: MatrixClient | null = null

const createStore = async () => {
    try {
        const store = new IndexedDBStore({
            indexedDB: window.indexedDB,
            localStorage: window.localStorage,
            dbName: 'capsa-matrix-store',

        });
        await store.startup();
        return store;

    } catch (error) {
        console.warn('IndexedDB store failed, falling back to MemoryStore', error);
        return new MemoryStore();
    }
};

export const initClient = async (session: MatrixSession): Promise<MatrixClient> => {
    if (client) {
        client.stopClient();
    }
    const store = await createStore();
    client = createClient({
        baseUrl: MATRIX_HOMESERVER_URL,
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
        store,
    });

    await initCrypto();

    return client;
};

// сквозное шифрование: rust-криптобэкенд (wasm)
// отправка/расшифровка в зашифрованных комнатах дальше работает автоматически
const initCrypto = async (): Promise<void> => {
    try {
        await client!.initRustCrypto({
            useIndexedDB: true,
            cryptoDatabasePrefix: 'capsa-crypto',
        });

        const crypto = client!.getCrypto();
        if (crypto) {
            // ключи шифрования расдаются всем устройствам в комнате:
            // без верификации устройств сообщения всё равно доставляются
            crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(false));

            // cross-signing: если на сервере уже есть ключи — доверяем им;
            // для нового аккаунта бутстрап не критичен (шифрование работает и так)
            if (!(await crypto.isCrossSigningReady())) {
                try {
                    await crypto.bootstrapCrossSigning({});
                } catch {
                    // бутстрап требует UIA (пароль) — не блокируем запуск,
                    // устройства будут «непроверенными», но E2EE работает
                }
            }
        }
    } catch (error) {
        console.error('Failed to initialize crypto:', error);
    }
};

export const startClient = async (): Promise<void> => {
    const matrixClient = getClient();
    if (!matrixClient.getSyncState()) {
        await matrixClient.startClient();
    }
};


export const loginUser = async (
    login: string,
    password: string,
): Promise<LoginResponse> => {
    const tempClient = createClient({ baseUrl: MATRIX_HOMESERVER_URL });
    return tempClient.loginRequest({  

        type: 'm.login.password',
        identifier: {
            type: 'm.id.user',
            user: login,
        },
        password,
    });
};
    




 

export const getClient = (): MatrixClient => {

    if (!client) {
        throw new Error('Matrix client not initialized — call initClient() first')
    }
    return client

};

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

export interface UserSearchResult {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
}

// поиск по директории людей homeserver'а
// (матчатся userId, display name и домен)
export const searchUsers = async (
    query: string
): Promise<UserSearchResult[]> => {
    const client = getClient();
    const response = await client.searchUserDirectory({
        term: query,
        limit: 10,
    });
    return response.results.map((result) => ({
        userId: result.user_id,
        displayName: result.display_name ?? undefined,
        avatarUrl: result.avatar_url ?? undefined,
    }));
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




