import { createClient } from 'matrix-js-sdk';
import type {LoginResponse, IPublicRoomsChunkRoom, Room} from "matrix-js-sdk";
import {getSession} from './session'
const client = createClient({ baseUrl: 'https://matrix.org' });

export const loginUser = async (
    login: string,
    password: string,
): Promise<LoginResponse> => {


    return client.loginRequest({
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
        return client
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


