import { createClient } from 'matrix-js-sdk';

export const loginUser = (login: string, password: string) => {
  const client = createClient({ baseUrl: 'https://matrix.org' });

  return client.loginRequest({
    type: 'm.login.password',
    identifier: {
      type: 'm.id.user',
      user: login,
    },
    password,
  });
};


