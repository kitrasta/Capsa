import { createClient, MemoryStore, IndexedDBStore} from 'matrix-js-sdk';
import type {LoginResponse, IPublicRoomsChunkRoom, Room, MatrixClient} from "matrix-js-sdk";
import {getSession} from './session';
import type { MatrixSession } from './session';

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
        baseUrl: 'https://matrix.org',
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
        store,
    });
    return client;
} 

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
    const tempClient = createClient({ baseUrl: 'https://matrix.org' });
    return tempClient.loginRequest({  

        type: 'm.login.password',
        identifier: {
            type: 'm.id.user',
            user: login,
        },
        password,
    });
};
    




 

export const getClient = () => {
    const session = getSession();
    if (!session) {
        throw new Error('Ошибка')
    }
    client.setAccessToken(session.accessToken);
    return client
}

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

export const getMyRooms = async (): Promise<Room[]> => {
    const client = getClient();
    const response = await client.getJoinedRooms();
    return response.joined_rooms
    .map((roomId) => client.getRoom(roomId))
    .filter((room): room is Room => room !== null)
}


