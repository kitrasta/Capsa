import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    createStore: vi.fn(),
    initCrypto: vi.fn(),
    otkError: vi.fn(),
    loggerError: vi.fn(),
    getRememberedDeviceId: vi.fn(),
    rememberDeviceIdentity: vi.fn(),
    wipeRoomStore: vi.fn(),
    deleteDatabase: vi.fn(),
}));

vi.mock('matrix-js-sdk', () => ({ createClient: mocks.createClient }));
vi.mock('matrix-js-sdk/lib/logger', () => ({
    logger: {
        error: mocks.loggerError,
        getChild: () => ({ error: mocks.loggerError }),
    },
}));
vi.mock('../storage', () => ({
    createStore: mocks.createStore,
    closeRoomStore: vi.fn(),
    wipeRoomStore: mocks.wipeRoomStore,
    deleteDatabase: mocks.deleteDatabase,
    ROOM_STORE_DB_NAME: 'test-store',
}));
vi.mock('../crypto', () => ({
    initCrypto: mocks.initCrypto,
    cryptoDbNamesForUser: vi.fn(() => ['crypto-db', 'crypto-meta-db']),
}));
vi.mock('../device-identity', () => ({
    getRememberedDeviceId: mocks.getRememberedDeviceId,
    rememberDeviceIdentity: mocks.rememberDeviceIdentity,
}));
vi.mock('../session', () => ({ clearSession: vi.fn() }));
vi.mock('../secret-storage-key', () => ({
    cacheSecretStorageKey: vi.fn(),
    clearSecretStorageKey: vi.fn(),
    getSecretStorageKey: vi.fn(),
}));
vi.mock('../crypto-conflict', () => ({ otkConflict: { error: mocks.otkError } }));

import { initClient, loginUser, logout } from '../client';
import type { LoginTarget } from '../homeserver';
import type { MatrixSession } from '../session';

const TARGET: LoginTarget = {
    identifier: '@alice:matrix.org',
    homeserverUrl: 'https://matrix-client.matrix.org',
    serverName: 'matrix.org',
};

const SESSION: MatrixSession = {
    accessToken: 'access-token',
    userId: '@alice:matrix.org',
    deviceId: 'DEVICE1',
    homeserverUrl: 'https://matrix-client.matrix.org',
    serverName: 'matrix.org',
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRememberedDeviceId.mockReturnValue(null);
});

describe('loginUser', () => {
    it('использует homeserver и identifier из resolved target', async () => {
        const loginRequest = vi.fn(async () => ({
            access_token: 'token',
            user_id: '@alice:matrix.org',
            device_id: 'DEVICE1',
        }));
        mocks.createClient.mockReturnValue({ loginRequest } as never);

        await loginUser(TARGET, 'password');

        expect(mocks.createClient).toHaveBeenCalledWith({
            baseUrl: 'https://matrix-client.matrix.org',
        });
        expect(loginRequest).toHaveBeenCalledWith({
            type: 'm.login.password',
            identifier: { type: 'm.id.user', user: '@alice:matrix.org' },
            password: 'password',
            initial_device_display_name: 'Capsa Web',
        });
    });

    it('повторно использует device ID только для того же аккаунта', async () => {
        const loginRequest = vi.fn(async () => ({
            access_token: 'token',
            user_id: '@alice:matrix.org',
            device_id: 'DEVICE1',
        }));
        mocks.createClient.mockReturnValue({ loginRequest } as never);
        mocks.getRememberedDeviceId.mockReturnValue('DEVICE1');

        await loginUser(TARGET, 'password');

        expect(mocks.getRememberedDeviceId).toHaveBeenCalledWith(TARGET);
        expect(loginRequest).toHaveBeenCalledWith(expect.objectContaining({
            device_id: 'DEVICE1',
        }));
    });
});

describe('initClient', () => {
    it('использует homeserverUrl сессии и сохраняет crypto/OTK настройки', async () => {
        const store = { kind: 'store' };
        const matrixClient = { stopClient: vi.fn() };
        mocks.createStore.mockResolvedValue(store);
        mocks.createClient.mockReturnValue(matrixClient as never);
        mocks.initCrypto.mockResolvedValue(undefined);

        await initClient(SESSION);

        expect(mocks.createClient).toHaveBeenCalledTimes(1);
        const options = mocks.createClient.mock.calls[0][0];
        expect(options).toMatchObject({
            baseUrl: 'https://matrix-client.matrix.org',
            accessToken: 'access-token',
            userId: '@alice:matrix.org',
            deviceId: 'DEVICE1',
            store,
        });
        expect(options.cryptoCallbacks).toEqual({
            getSecretStorageKey: expect.any(Function),
            cacheSecretStorageKey: expect.any(Function),
        });
        expect(options.logger).toBeDefined();
        expect(mocks.initCrypto).toHaveBeenCalledWith(matrixClient);
        expect(mocks.rememberDeviceIdentity).toHaveBeenCalledWith(
            '@alice:matrix.org',
            'DEVICE1',
        );
    });
});

describe('logout', () => {
    it('удаляет сессию и room store, но сохраняет криптобазу устройства', async () => {
        const matrixClient = {
            stopClient: vi.fn(),
            logout: vi.fn(async () => ({})),
            getUserId: vi.fn(() => SESSION.userId),
        };
        mocks.createStore.mockResolvedValue({ kind: 'store' });
        mocks.createClient.mockReturnValue(matrixClient as never);
        mocks.initCrypto.mockResolvedValue(undefined);
        await initClient(SESSION);

        await logout();

        expect(mocks.wipeRoomStore).toHaveBeenCalledTimes(1);
        expect(mocks.deleteDatabase).toHaveBeenCalledTimes(1);
        expect(mocks.deleteDatabase).toHaveBeenCalledWith('test-store');
        expect(mocks.deleteDatabase).not.toHaveBeenCalledWith('crypto-db');
        expect(mocks.deleteDatabase).not.toHaveBeenCalledWith('crypto-meta-db');
    });
});
