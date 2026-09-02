import { createClient } from 'matrix-js-sdk';
const client = createClient({ baseUrl: 'https://matrix.org' });

export const loginUser = (login: string, password: string) => {


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


