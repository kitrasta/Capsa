import { createClient } from 'matrix-js-sdk';
import type {LoginResponse, IPublicRoomsChunkRoom} from "matrix-js-sdk";
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

export const getClient = () => client;

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


