// Создание и получение Matrix-клиента: singleton, init/start/stop/logout,
// вход по логину/паролю. Здесь только клиент — крипто (crypto.ts),
// хранилища (storage.ts) и API-вызовы (api/*) живут в своих модулях.
// Публичный API слоя — index.ts.
import { createClient } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import type { MatrixSession } from './session';
import { clearSession } from './session';
import {
    createStore,
    closeRoomStore,
    wipeRoomStore,
    deleteDatabase,
    ROOM_STORE_DB_NAME,
} from './storage';
import { initCrypto, cryptoDbNamesForUser } from './crypto';
import {
    cacheSecretStorageKey,
    clearSecretStorageKey,
    getSecretStorageKey,
} from './secret-storage-key';
import { requireHomeserverUrl } from './config';

// адрес homeserver'а и server_name — в config.ts (без зависимостей от SDK);
// ре-экспорт для API-модулей (api/spaces) и обратной совместимости
export { MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME } from './config';

let client: MatrixClient | null = null;

// создание клиента: store → client → rust-crypto.
// Обработку ошибок sync (M_UNKNOWN_TOKEN) вешает client-manager —
// клиент их только репортит, реакция едина для всего приложения
export const initClient = async (session: MatrixSession): Promise<MatrixClient> => {
    if (client) {
        client.stopClient();
    }
    const store = await createStore();
    client = createClient({
        baseUrl: requireHomeserverUrl(),
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
        store,
        cryptoCallbacks: {
            getSecretStorageKey,
            cacheSecretStorageKey,
        },
    });
    await initCrypto(client);
    return client;
};

export const getClient = (): MatrixClient => {

    if (!client) {
        throw new Error('Matrix client not initialized — call initClient() first')
    }
    return client

};

export const startClient = async (): Promise<void> => {
    const matrixClient = getClient();
    if (!matrixClient.getSyncState()) {
        await matrixClient.startClient();
    }
};

// Локальная остановка клиента без серверного /logout: нужна для
// M_UNKNOWN_TOKEN — токен уже отозван, звонить на сервер бессмысленно.
// Данные (комнаты, крипто-ключи) не трогаем: пользователь может войти снова.
export const stopClient = async (): Promise<void> => {
    clearSecretStorageKey();
    if (client) {
        client.stopClient();
        client = null;
    }
    try {
        await closeRoomStore();
    } catch (error) {
        console.warn('Failed to destroy room store on stop', error);
    }
};

// выход: останавливаем клиент, чистим localStorage и IndexedDB
export const logout = async (): Promise<void> => {
    clearSecretStorageKey();
    const matrixClient = getClient();
    // захватываем userId ДО сброса синглтона: без клиента его не взять
    const userId = matrixClient.getUserId();

    let deleteResults: PromiseSettledResult<void>[] | undefined;
    let roomStoreError: unknown | undefined = undefined;
    try {
        await matrixClient.logout();
    } finally {
        // даже при ошибке сети юзер должен выйти из сломанной сессии
        matrixClient.stopClient();
        // только свои ключи сессии — все операции с localStorage живут в session.ts
        clearSession();
        // сброс синглтона: повторный вход создаст свежий клиент
        client = null;

        // стираем данные room-стора и закрываем его соединение до deleteDatabase,
        // иначе удаление упрётся в blocked и logout повиснет
        try {
            await wipeRoomStore();
        } catch (error) {
            roomStoreError = error;
        }

        // вытираем начисто room-стор и ОБЕ крипто-базы текущего аккаунта
        // (чужие scoped-базы не трогаем), дожидаясь реального удаления:
        // allSettled, чтобы падение одного удаления не отменило остальные
        const dbNames = [
            ROOM_STORE_DB_NAME,
            ...(userId ? cryptoDbNamesForUser(userId) : []),
        ];
        deleteResults = await Promise.allSettled(dbNames.map(deleteDatabase));
    }

    // после finally: throw здесь не перетирает ошибку серверного logout
    const failures = (deleteResults ?? []).filter((r) => r.status === 'rejected');
    if (roomStoreError || failures.length > 0) {
        // logout нельзя считать успешным — ошибка всплывёт вызывающему
        throw new Error(
            `Не удалось завершить logout: не удалено баз (${failures.length})` +
                (roomStoreError ? ', стор не закрылся' : ''),
        );
    }
};

// Ответ от /login: поля доступны по спецификации, но их может не быть —
// поэтому проверяем их явным образом, а не полагаемся на типы.
interface MatrixLoginResponse {
    access_token?: string;
    user_id?: string;
    device_id?: string;
}

// Проверка полей login-ответа строго на непустую строку.
// accessToken проверяем только так: с Matrix нет устойчивого формата токена,
// и мы его нигде не логируем — привязываться к формату regex-ом смысла нет.
// userId проверяем на Matrix-форму @localpart:homeserver.
export function validateLoginResponse(
    result: MatrixLoginResponse,
): asserts result is Required<MatrixLoginResponse> {
    if (!result.access_token || typeof result.access_token !== 'string' || result.access_token.trim().length === 0) {
        throw new Error('Неполный ответ сервера: отсутствует access_token');
    }
    if (!result.user_id || typeof result.user_id !== 'string' || !/^@[^:]+:.+$/.test(result.user_id)) {
        throw new Error('Неполный ответ сервера: отсутствует user_id или неверный Matrix-идентификатор');
    }
    if (!result.device_id || typeof result.device_id !== 'string' || result.device_id.trim().length === 0) {
        throw new Error('Неполный ответ сервера: отсутствует device_id');
    }
}

export const loginUser = async (
    login: string,
    password: string,
): Promise<MatrixLoginResponse> => {
    const tempClient = createClient({ baseUrl: requireHomeserverUrl() });
    return tempClient.loginRequest({  

        type: 'm.login.password',
        identifier: {
            type: 'm.id.user',
            user: login,
        },
        password,
    });
};
