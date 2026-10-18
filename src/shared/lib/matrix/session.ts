export interface MatrixSession {
    accessToken: string,
    userId: string,
    deviceId: string,
}

// Новые ключи с общим префиксом — единственный источник правды для чтения/записи.
const SESSION_KEYS = {
    accessToken: 'capsa.matrix.accessToken',
    userId: 'capsa.matrix.userId',
    deviceId: 'capsa.matrix.deviceId',
} as const;

// Старые (глобальные) ключи. Используются только для миграции в getSession().
// Не удаляем их при logout: если на этом же origin ещё жива старая сборка (кэш dist),
// она читает matrix_access_token — её собственное состояние не наше дело.
// Миграция переносит значения и снимает старые ключи только когда новых нет целиком.
const LEGACY_KEYS = {
    accessToken: 'matrix_access_token',
    userId: 'matrix_user_id',
    deviceId: 'matrix_device_id',
} as const;

type SessionField = keyof typeof SESSION_KEYS;

// Строгая проверка формы сессии.
// accessToken проверяем только на непустую строку: у Matrix нет устойчивого формата
// токена, привязываться к нему regex-ом смысла нет (и мы его нигде не логируем).
// userId проверяем на Matrix-форму @localpart:homeserver.
const isValidSession = (session: Partial<MatrixSession> | Record<'accessToken' | 'userId' | 'deviceId', string | null>): session is MatrixSession =>
    typeof session.accessToken === 'string' &&
    session.accessToken.trim().length > 0 &&
    typeof session.userId === 'string' &&
    /^@[^:]+:.+$/.test(session.userId) &&
    typeof session.deviceId === 'string' &&
    session.deviceId.trim().length > 0;

let migrationDone = false;

function removeSessionKeys(): void {
    (Object.keys(SESSION_KEYS) as SessionField[]).forEach((field) => {
        localStorage.removeItem(SESSION_KEYS[field]);
    });
}

function removeLegacyKeys(): void {
    (Object.keys(LEGACY_KEYS) as SessionField[]).forEach((field) => {
        localStorage.removeItem(LEGACY_KEYS[field]);
    });
}

// Однократная и тихая миграция со старых ключей на новые. Токен никогда не логируется.
// done = false означает временный сбой хранения — миграцию можно повторить
// при следующем getSession().
function migrateLegacyKeys(): { session: MatrixSession | null; done: boolean } {
    try {
        const accessToken = localStorage.getItem(LEGACY_KEYS.accessToken);
        const userId = localStorage.getItem(LEGACY_KEYS.userId);
        const deviceId = localStorage.getItem(LEGACY_KEYS.deviceId);

        // Старых ключей нет — делать нечего, миграция завершена.
        if (accessToken === null && userId === null && deviceId === null) {
            return { session: null, done: true };
        }

        const legacySession = { accessToken, userId, deviceId };
        // Битые старые значения просто удаляем — повторять нечего.
        if (!isValidSession(legacySession)) {
            removeLegacyKeys();
            return { session: null, done: true };
        }

        // Сначала пишем новый формат...
        try {
            localStorage.setItem(SESSION_KEYS.accessToken, legacySession.accessToken);
            localStorage.setItem(SESSION_KEYS.userId, legacySession.userId);
            localStorage.setItem(SESSION_KEYS.deviceId, legacySession.deviceId);
        } catch {
            // Запись не удалась — убираем частично записанные новые ключи,
            // старые не трогаем: они остаются для следующей попытки миграции.
            removeSessionKeys();
            return { session: null, done: false };
        }

        // ...и только после успешной записи удаляем старые ключи.
        removeLegacyKeys();
        return { session: legacySession, done: true };
    } catch {
        // Ошибка доступа при чтении (приватный режим и т.п.) —
        // миграцию не считаем завершённой, повторим позже.
        return { session: null, done: false };
    }
}

export function getSession(): MatrixSession | null {
    try {
        // 1. читаем новые ключи
        const accessToken = localStorage.getItem(SESSION_KEYS.accessToken);
        const userId = localStorage.getItem(SESSION_KEYS.userId);
        const deviceId = localStorage.getItem(SESSION_KEYS.deviceId);
        const session = { accessToken, userId, deviceId };

        // 2. новая сессия валидна — возвращаем её (миграция не нужна)
        if (isValidSession(session)) {
            return session;
        }

        // 3. новых ключей нет целиком — пробуем мигрировать со старых
        const noNewKeys =
            accessToken === null && userId === null && deviceId === null;
        if (noNewKeys && !migrationDone) {
            const migrated = migrateLegacyKeys();
            // Миграцию считаем завершённой только когда она дошла до конца;
            // при временном сбое хранения повторим при следующем getSession().
            migrationDone = migrated.done;
            // Старые значения были валидны — возвращаем мигрированную сессию
            if (migrated.session) {
                return migrated.session;
            }
        }

        // 5. частичная/битая запись в новом формате — чистим только свои ключи
        if (!noNewKeys) {
            clearSession();
        }
        return null;
    } catch {
        // Ошибка доступа к хранилищу — ничего не удаляем, просто считаем что сессии нет
        return null;
    }
}

// Пишем только новые ключи (capsa.matrix.*) — старые не восстанавливаем.
export function saveSession(session: MatrixSession): void {
    if (!isValidSession(session)) {
        throw new Error('Invalid Matrix session');
    }
    localStorage.setItem(SESSION_KEYS.accessToken, session.accessToken);
    localStorage.setItem(SESSION_KEYS.userId, session.userId);
    localStorage.setItem(SESSION_KEYS.deviceId, session.deviceId);
}

// Удаляем только ключи Capsa — никакого localStorage.clear(), чужие данные origin не трогаем.
export function clearSession(): void {
    removeSessionKeys();
}
