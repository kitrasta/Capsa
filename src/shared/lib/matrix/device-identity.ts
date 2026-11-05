import type { LoginTarget } from './homeserver';

// Это не сессия и не секрет: только соответствие Matrix ID и device ID.
// Оно переживает logout, чтобы повторный вход мог вернуться к тем же
// локальным E2EE-ключам вместо создания нового Matrix-устройства.
const DEVICE_ID_KEY_PREFIX = 'capsa.matrix.deviceIdentity.';

const normalizeUserId = (userId: string): string => userId.trim().toLowerCase();

const userIdForTarget = (target: LoginTarget): string =>
    target.identifier.startsWith('@')
        ? target.identifier
        : `@${target.identifier}:${target.serverName}`;

const storageKey = (userId: string): string =>
    `${DEVICE_ID_KEY_PREFIX}${encodeURIComponent(normalizeUserId(userId))}`;

export const rememberDeviceIdentity = (userId: string, deviceId: string): void => {
    if (!userId.trim() || !deviceId.trim()) return;
    try {
        localStorage.setItem(storageKey(userId), deviceId);
    } catch {
        // Вход не должен зависеть от доступности localStorage.
    }
};

export const getRememberedDeviceId = (target: LoginTarget): string | null => {
    try {
        const deviceId = localStorage.getItem(storageKey(userIdForTarget(target)));
        return deviceId?.trim() ? deviceId : null;
    } catch {
        return null;
    }
};
