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

// Однократная и тихая миграция со старых ключей на новые.
// Валидные старые значения переносятся в новый формат и старые ключи удаляются.
// Битые старые значения просто удаляются. Токен никогда не логируется.
function migrateLegacyKeys(): MatrixSession | null {
    try {
        const accessToken = localStorage.getItem(LEGACY_KEYS.accessToken);
        const userId = localStorage.getItem(LEGACY_KEYS.userId);
        const deviceId = localStorage.getItem(LEGACY_KEYS.deviceId);

        // Старых ключей нет — делать нечего.
        if (accessToken === null && userId === null && deviceId === null) {
            return null;
        }

        const legacySession = { accessToken, userId, deviceId };
        // Удаляем битые старые ключи в любом случае.
        localStorage.removeItem(LEGACY_KEYS.accessToken);
        localStorage.removeItem(LEGACY_KEYS.userId);
        localStorage.removeItem(LEGACY_KEYS.deviceId);

        if (!isValidSession(legacySession)) {
            return null;
        }

        // Переносим в новый формат.
        localStorage.setItem(SESSION_KEYS.accessToken, legacySession.accessToken);
        localStorage.setItem(SESSION_KEYS.userId, legacySession.userId);
        localStorage.setItem(SESSION_KEYS.deviceId, legacySession.deviceId);
        return legacySession;
    } catch {
        // localStorage может быть недоступен (приватный режим и т.п.) — пропускаем
        return null;
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
            migrationDone = true;
            const migrated = migrateLegacyKeys();
            // 4. старые значения были валидны — возвращаем мигрированную сессию
            if (migrated) {
                return migrated;
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
    (Object.keys(SESSION_KEYS) as SessionField[]).forEach((field) => {
        localStorage.removeItem(SESSION_KEYS[field]);
    });
}
