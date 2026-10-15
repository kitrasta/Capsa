import { createClient, MemoryStore, IndexedDBStore } from 'matrix-js-sdk';
import { AllDevicesIsolationMode } from 'matrix-js-sdk/lib/crypto-api';
import type {LoginResponse, IPublicRoomsChunkRoom, Room, MatrixClient} from "matrix-js-sdk";
import type { MatrixSession } from './session';
import { clearSession } from './session';

import { Preset, RoomType, Visibility, EventType } from 'matrix-js-sdk';

export const MATRIX_HOMESERVER_URL = 'https://matrix.org';

// префикс крипто-базы rust-бэкенда. Важно: реальные имена баз —
// `${prefix}::matrix-sdk-crypto` и `${prefix}::matrix-sdk-crypto-meta`,
// поэтому удалять их надо через client.clearStores({ cryptoDatabasePrefix }),
// а не голом deleteDatabase по имени префикса
const CRYPTO_DB_PREFIX_BASE = 'capsa-crypto';

// scoped-префикс: база привязана к аккаунту, поэтому второй аккаунт
// в том же браузере физически не может увидеть чужие account-ключи
const cryptoDbPrefix = (userId: string): string => {
    // имя IndexedDB не должно содержать ':' и прочие недопустимые символы
    const safeUserId = userId.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `${CRYPTO_DB_PREFIX_BASE}:${safeUserId}`;
};

let client: MatrixClient | null = null
// ссылка на room-стор: при выходе нужно закрыть его соединение с IndexedDB,
// иначе deleteDatabase упрётся в blocked и logout повиснет
let roomStore: IndexedDBStore | null = null

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
    if (store instanceof IndexedDBStore) {
        roomStore = store;
    } else {
        roomStore = null;
    }
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

// крипто-база принадлежит другому аккаунту: чужие account-ключи бесполезны и опасны.
// Лечится только удалением базы и повторной инициализацией
const isAccountMismatchError = (error: unknown): boolean => {
    const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return /doesn'?t match|does not match/i.test(message);
};

// сквозное шифрование: rust-криптобэкенд (wasm)
// отправка/расшифровка в зашифрованных комнатах дальше работает автоматически
const initCrypto = async (): Promise<void> => {
    const userId = client!.getUserId();
    if (!userId) {
        throw new Error('Cannot init crypto: client has no userId');
    }
    const prefix = cryptoDbPrefix(userId);
    const opts = { useIndexedDB: true, cryptoDatabasePrefix: prefix };

    try {
        await client!.initRustCrypto(opts);
    } catch (error) {
        if (!isAccountMismatchError(error)) {
            console.error('Failed to initialize crypto:', error);
            throw new Error(
                'Не удалось включить сквозное шифрование. Проверьте соединение и перезагрузите страницу.',
                { cause: error },
            );
        }

        // база с чужими ключами — удаляем её и пробуем ещё раз (один раз,
        // иначе зациклимся на повторяющейся ошибке)
        console.warn(
            'Crypto store belongs to another account — clearing it and retrying once',
            error,
        );
        try {
            await client!.clearStores({ cryptoDatabasePrefix: prefix });
            await client!.initRustCrypto(opts);
        } catch (retryError) {
            console.error('Failed to initialize crypto after reset:', retryError);
            throw new Error(
                'Не удалось включить сквозное шифрование. Перейдите на другой аккаунт или очистите данные сайта.',
                { cause: retryError },
            );
        }
    }

    const crypto = client!.getCrypto();
    if (!crypto) {
        // initRustCrypto не бросил ошибку, но и крипто не дал — тихо игнорировать нельзя
        throw new Error('Сквозное шифрование недоступно в этом окружении.');
    }

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

export const createSpace = async (name: string): Promise<string> => {
    const client = getClient();
    const { room_id } = await client.createRoom({
        name,
        creation_content: { type: RoomType.Space },
    });
    return room_id;
};

// добавить комнату в пространство: m.space.child — state-событие
// внутри самой space-комнаты, state_key = roomId ребёнка
export const addRoomToSpace = async (
    spaceId: string,
    roomId: string,
): Promise<void> => {
    const client = getClient();
    // via — серверы, через которые можно резолвить ребёнка (спека spaces)
    const via = [new URL(MATRIX_HOMESERVER_URL).hostname];
    await client.sendStateEvent(spaceId, EventType.SpaceChild, { via }, roomId);
};

export interface SpaceChildInfo {
    roomId: string;
    name: string | null;
    avatarUrl: string | null;
    joined: boolean;
}

// summary не-joined ребёнка пространства: имя/аватар с сервера
export const getRoomSummary = async (
    roomId: string,
    via: string[],
): Promise<{ name: string | null; avatar_url: string | null }> => {
    const client = getClient();
    const summary = await client.getRoomSummary(roomId, via);
    return { name: summary.name ?? null, avatar_url: summary.avatar_url ?? null };
};

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
    });
    return room_id;
};

// смена отображаемого имени профиля
export const setDisplayName = async (name: string): Promise<void> => {
    const client = getClient();
    await client.setDisplayName(name);
};

// загрузка аватара (mxc-Url вернёт сервер)
export const setAvatar = async (file: File): Promise<void> => {
    const client = getClient();
    const { content_uri } = await client.uploadContent(file, { type: file.type });
    await client.setAvatarUrl(content_uri);
};

// удаление базы IndexedDB с проверкой результата:
// deleteDatabase возвращает request с событиями — оборачиваем в Promise,
// чтобы не считать logout успешным при неудалении.
// blocked = базу держит открытое соединение: не завершаем promise,
// а репортим ошибку — logout не должен висеть вечно
const deleteDatabase = (name: string): Promise<void> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () =>
            reject(
                request.error ??
                    new Error(`Не удалось удалить IndexedDB: ${name}`),
            );
        request.onblocked = () =>
            reject(
                new Error(
                    `База ${name} заблокирована открытым соединением (blocked)`,
                ),
            );
    });

// имена баз rust-криптобэкенда для данного префикса
// (см. client.clearStores в matrix-js-sdk — SDK создаёт ровно эти две)
const rustCryptoDbNames = (prefix: string): string[] => [
    `${prefix}::matrix-sdk-crypto`,
    `${prefix}::matrix-sdk-crypto-meta`,
];

// выход: останавливаем клиент, чистим localStorage и IndexedDB
export const logout = async (): Promise<void> => {
    const matrixClient = getClient();
    // захватываем scoped-префикс ДО сброса синглтона: без клиента userId не взять
    const userId = matrixClient.getUserId();
    const cryptoPrefix = userId ? cryptoDbPrefix(userId) : null;

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

        // закрываем соединение room-стора до deleteDatabase,
        // иначе удаление упрётся в blocked и logout повиснет
        if (roomStore) {
            try {
                await roomStore.deleteAllData();
                await roomStore.destroy();
            } catch (error) {
                roomStoreError = error;
            }
            roomStore = null;
        }

        // вытираем начисто room-стор и ОБЕ крипто-базы текущего аккаунта
        // (чужиеscoped-базы не трогаем), дожидаясь реального удаления:
        // allSettled, чтобы падение одного удаления не отменило остальные
        const dbNames = [
            'capsa-matrix-store',
            ...(cryptoPrefix ? rustCryptoDbNames(cryptoPrefix) : []),
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

