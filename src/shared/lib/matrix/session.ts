import { MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME } from './config';

export interface MatrixSession {
    accessToken: string;
    userId: string;
    deviceId: string;
    homeserverUrl: string;
    serverName: string;
}

type MatrixCredentials = Pick<MatrixSession, 'accessToken' | 'userId' | 'deviceId'>;
type NullableCredentials = Record<keyof MatrixCredentials, string | null>;
type NullableSession = Record<keyof MatrixSession, string | null>;

// Новые ключи с общим префиксом — единственный источник правды для чтения/записи.
const SESSION_KEYS = {
    accessToken: 'capsa.matrix.accessToken',
    userId: 'capsa.matrix.userId',
    deviceId: 'capsa.matrix.deviceId',
    homeserverUrl: 'capsa.matrix.homeserverUrl',
    serverName: 'capsa.matrix.serverName',
} as const;

// Старые глобальные ключи используются только для миграции в getSession().
const LEGACY_KEYS = {
    accessToken: 'matrix_access_token',
    userId: 'matrix_user_id',
    deviceId: 'matrix_device_id',
} as const;

type SessionField = keyof typeof SESSION_KEYS;

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

const accountServerName = (userId: string): string | null => {
    const separator = userId.indexOf(':');
    return userId.startsWith('@') && separator > 1 && separator < userId.length - 1
        ? userId.slice(separator + 1).toLowerCase()
        : null;
};

const isValidCredentials = (
    session: Partial<MatrixCredentials> | NullableCredentials,
): session is MatrixCredentials =>
    isNonEmptyString(session.accessToken) &&
    isNonEmptyString(session.userId) &&
    accountServerName(session.userId) !== null &&
    isNonEmptyString(session.deviceId);

const isValidHomeserverUrl = (value: unknown): value is string => {
    if (!isNonEmptyString(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
        return false;
    }
};

const isValidSession = (
    session: Partial<MatrixSession> | NullableSession,
): session is MatrixSession =>
    isValidHomeserverUrl(session.homeserverUrl) &&
    isNonEmptyString(session.serverName) &&
    isNonEmptyString(session.userId) &&
    accountServerName(session.userId) === session.serverName.trim().toLowerCase() &&
    isValidCredentials(session);

const defaultConnectionFor = (userId: string): Pick<MatrixSession, 'homeserverUrl' | 'serverName'> | null => {
    if (
        !isValidHomeserverUrl(MATRIX_HOMESERVER_URL) ||
        !MATRIX_SERVER_NAME ||
        accountServerName(userId) !== MATRIX_SERVER_NAME.toLowerCase()
    ) {
        return null;
    }
    return { homeserverUrl: MATRIX_HOMESERVER_URL, serverName: MATRIX_SERVER_NAME };
};

let migrationDone = false;

function removeSessionKeys(): void {
    (Object.keys(SESSION_KEYS) as SessionField[]).forEach((field) => {
        localStorage.removeItem(SESSION_KEYS[field]);
    });
}

function removeLegacyKeys(): void {
    (Object.keys(LEGACY_KEYS) as Array<keyof typeof LEGACY_KEYS>).forEach((field) => {
        localStorage.removeItem(LEGACY_KEYS[field]);
    });
}

function writeSession(session: MatrixSession): void {
    (Object.keys(SESSION_KEYS) as SessionField[]).forEach((field) => {
        localStorage.setItem(SESSION_KEYS[field], session[field]);
    });
}

// Однократная и тихая миграция старых глобальных ключей. Токен не логируется.
function migrateLegacyKeys(): { session: MatrixSession | null; done: boolean } {
    try {
        const accessToken = localStorage.getItem(LEGACY_KEYS.accessToken);
        const userId = localStorage.getItem(LEGACY_KEYS.userId);
        const deviceId = localStorage.getItem(LEGACY_KEYS.deviceId);

        if (accessToken === null && userId === null && deviceId === null) {
            return { session: null, done: true };
        }

        const legacyCredentials = { accessToken, userId, deviceId };
        const connection = isValidCredentials(legacyCredentials)
            ? defaultConnectionFor(legacyCredentials.userId)
            : null;
        if (!isValidCredentials(legacyCredentials) || !connection) {
            removeLegacyKeys();
            return { session: null, done: true };
        }
        const legacySession = { ...legacyCredentials, ...connection };

        try {
            writeSession(legacySession);
        } catch {
            // Не оставляем частичную новую запись; старую сохраняем для retry.
            removeSessionKeys();
            return { session: null, done: false };
        }

        removeLegacyKeys();
        return { session: legacySession, done: true };
    } catch {
        // Временный сбой чтения — повторим при следующем getSession().
        return { session: null, done: false };
    }
}

export function getSession(): MatrixSession | null {
    try {
        const accessToken = localStorage.getItem(SESSION_KEYS.accessToken);
        const userId = localStorage.getItem(SESSION_KEYS.userId);
        const deviceId = localStorage.getItem(SESSION_KEYS.deviceId);
        const homeserverUrl = localStorage.getItem(SESSION_KEYS.homeserverUrl);
        const serverName = localStorage.getItem(SESSION_KEYS.serverName);
        const session = { accessToken, userId, deviceId, homeserverUrl, serverName };

        if (isValidSession(session)) return session;

        // Формат между старыми matrix_* и server-aware: дополняем только
        // трёхполевую запись, если домен аккаунта совпадает с конфигурацией.
        const credentials = { accessToken, userId, deviceId };
        if (homeserverUrl === null && serverName === null && isValidCredentials(credentials)) {
            const connection = defaultConnectionFor(credentials.userId);
            if (connection) return { ...credentials, ...connection };
        }

        const noNewKeys = Object.values(session).every((value) => value === null);
        if (noNewKeys && !migrationDone) {
            const migrated = migrateLegacyKeys();
            migrationDone = migrated.done;
            if (migrated.session) return migrated.session;
        }

        if (!noNewKeys) clearSession();
        return null;
    } catch {
        // Ошибка доступа к хранилищу — ничего не удаляем.
        return null;
    }
}

export function saveSession(session: MatrixSession): void {
    if (!isValidSession(session)) throw new Error('Invalid Matrix session');
    try {
        writeSession(session);
    } catch (error) {
        removeSessionKeys();
        throw error;
    }
}

// Удаляем только ключи Capsa — никакого localStorage.clear().
export function clearSession(): void {
    removeSessionKeys();
}
