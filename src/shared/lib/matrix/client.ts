// Создание и получение Matrix-клиента: singleton, init/start/stop/logout,
// вход по логину/паролю. Здесь только клиент — крипто (crypto.ts),
// хранилища (storage.ts) и API-вызовы (api/*) живут в своих модулях.
// Публичный API слоя — index.ts.
import { createClient } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import { logger as sdkLogger } from 'matrix-js-sdk/lib/logger';
import type { Logger } from 'matrix-js-sdk/lib/logger';
import type { MatrixSession } from './session';
import type { LoginTarget } from './homeserver';
import { clearSession } from './session';
import {
    createStore,
    closeRoomStore,
    wipeRoomStore,
    deleteDatabase,
    ROOM_STORE_DB_NAME,
} from './storage';
import { initCrypto } from './crypto';
import {
    getRememberedDeviceId,
    rememberDeviceIdentity,
} from './device-identity';
import {
    cacheSecretStorageKey,
    clearSecretStorageKey,
    getSecretStorageKey,
} from './secret-storage-key';

import { otkConflict } from './crypto-conflict';

// адрес homeserver'а и server_name — в config.ts (без зависимостей от SDK);
// ре-экспорт для API-модулей (api/spaces) и обратной совместимости
export { MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME } from './config';

// SDK логирует конфликт one-time keys только через logger.error (см.
// crypto-conflict.ts). Оборачиваем стандартный логгер: все сообщения
// проходят дальше без изменений, параллельно детектор считает совпадения.
const loggerWithOtkDetection: Logger = {
    ...sdkLogger,
    error: (...args: unknown[]) => {
        otkConflict.error(...args);
        sdkLogger.error(...args);
    },
    getChild: (namespace: string) => {
        const child = sdkLogger.getChild(namespace);
        return {
            ...child,
            error: (...args: unknown[]) => {
                otkConflict.error(...args);
                child.error(...args);
            },
        };
    },
};

let client: MatrixClient | null = null;

// создание клиента: store → client → rust-crypto.
// Обработку ошибок sync (M_UNKNOWN_TOKEN) вешает client-manager —
// клиент их только репортит, реакция едина для всего приложения
export const initClient = async (session: MatrixSession): Promise<MatrixClient> => {
    rememberDeviceIdentity(session.userId, session.deviceId);
    if (client) {
        client.stopClient();
    }
    const store = await createStore();
    client = createClient({
        baseUrl: session.homeserverUrl,
        accessToken: session.accessToken,
        userId: session.userId,
        deviceId: session.deviceId,
        store,
        logger: loggerWithOtkDetection,
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

// выход: отзываем access token, останавливаем клиент и чистим room store.
// Scoped crypto store сохраняем: device identity тоже остаётся, поэтому при
// следующем входе этот браузер вернётся к тем же E2EE-ключам без recovery key.
export const logout = async (): Promise<void> => {
    clearSecretStorageKey();
    const matrixClient = getClient();
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

        // Крипто-базы здесь намеренно не удаляем. Они привязаны к user ID,
        // а loginUser повторно использует device ID того же аккаунта.
        deleteResults = await Promise.allSettled([deleteDatabase(ROOM_STORE_DB_NAME)]);
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
    target: LoginTarget,
    password: string,
): Promise<MatrixLoginResponse> => {
    const tempClient = createClient({ baseUrl: target.homeserverUrl });
    const rememberedDeviceId = getRememberedDeviceId(target);
    return tempClient.loginRequest({
        type: 'm.login.password',
        identifier: {
            type: 'm.id.user',
            user: target.identifier,
        },
        password,
        ...(rememberedDeviceId ? { device_id: rememberedDeviceId } : {}),
        initial_device_display_name: 'Capsa Web',
    });
};
