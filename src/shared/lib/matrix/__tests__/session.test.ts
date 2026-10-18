import { beforeEach, describe, expect, it, vi } from 'vitest';

const NEW_KEYS = {
    accessToken: 'capsa.matrix.accessToken',
    userId: 'capsa.matrix.userId',
    deviceId: 'capsa.matrix.deviceId',
} as const;

const LEGACY_KEYS = {
    accessToken: 'matrix_access_token',
    userId: 'matrix_user_id',
    deviceId: 'matrix_device_id',
} as const;

type SessionModule = typeof import('../session');

const VALID_SESSION = {
    accessToken: 'test-access-token',
    userId: '@alice:example.org',
    deviceId: 'DEVICE1',
};

// Управляемый fake localStorage: хранилище + программируемые сбои записи/чтения.
let data: Map<string, string>;
let failSetKey: string | null;
let failGetKey: string | null;

function installFakeStorage(): void {
    data = new Map();
    failSetKey = null;
    failGetKey = null;
    const fake = {
        getItem(key: string): string | null {
            if (key === failGetKey) throw new Error('SecurityError');
            return data.has(key) ? (data.get(key) as string) : null;
        },
        setItem(key: string, value: string): void {
            if (key === failSetKey) throw new Error('QuotaExceededError');
            data.set(key, String(value));
        },
        removeItem(key: string): void {
            data.delete(key);
        },
    };
    Object.defineProperty(globalThis, 'localStorage', {
        value: fake,
        configurable: true,
        writable: true,
    });
}

// Каждый тест получает чистый модульный state: migrationDone живёт
// на уровне модуля, поэтому нужен именно свежий импорт после resetModules.
async function freshSessionModule(): Promise<SessionModule> {
    vi.resetModules();
    return import('../session');
}

function seedLegacySession(overrides: Partial<typeof VALID_SESSION> = {}): void {
    const session = { ...VALID_SESSION, ...overrides };
    data.set(LEGACY_KEYS.accessToken, session.accessToken);
    data.set(LEGACY_KEYS.userId, session.userId);
    data.set(LEGACY_KEYS.deviceId, session.deviceId);
}

function seedNewSession(overrides: Partial<typeof VALID_SESSION> = {}): void {
    const session = { ...VALID_SESSION, ...overrides };
    data.set(NEW_KEYS.accessToken, session.accessToken);
    data.set(NEW_KEYS.userId, session.userId);
    data.set(NEW_KEYS.deviceId, session.deviceId);
}

function keysOf(keys: readonly string[]): string[] {
    return keys.filter((key) => data.has(key));
}

describe('session.ts', () => {
    beforeEach(() => {
        installFakeStorage();
    });

    it('нет ключей: getSession() возвращает null', async () => {
        const { getSession } = await freshSessionModule();

        expect(getSession()).toBeNull();
        expect([...data.keys()]).toEqual([]);
    });

    it('валидная новая сессия: getSession() возвращает объект из capsa.matrix.*', async () => {
        const { getSession } = await freshSessionModule();
        seedNewSession();

        expect(getSession()).toEqual(VALID_SESSION);
    });

    it('неполная новая сессия: null и все новые ключи удаляются', async () => {
        const { getSession } = await freshSessionModule();
        data.set(NEW_KEYS.accessToken, VALID_SESSION.accessToken);
        data.set(NEW_KEYS.userId, VALID_SESSION.userId);
        // deviceId отсутствует

        expect(getSession()).toBeNull();
        expect(keysOf(Object.values(NEW_KEYS))).toEqual([]);
    });

    it('невалидный userId: сессия отклоняется', async () => {
        const { getSession } = await freshSessionModule();
        seedNewSession({ userId: 'invalid-user' });

        expect(getSession()).toBeNull();
    });

    it('валидная legacy-сессия: переносится в capsa.matrix.*, старые ключи удаляются', async () => {
        const { getSession } = await freshSessionModule();
        seedLegacySession();

        expect(getSession()).toEqual(VALID_SESSION);
        expect(keysOf(Object.values(NEW_KEYS))).toEqual(Object.values(NEW_KEYS));
        expect(keysOf(Object.values(LEGACY_KEYS))).toEqual([]);
    });

    it('битая legacy-сессия: legacy-ключи удаляются, новая сессия не создаётся', async () => {
        const { getSession } = await freshSessionModule();
        seedLegacySession();
        data.delete(LEGACY_KEYS.deviceId); // не хватает одного из трёх

        expect(getSession()).toBeNull();
        expect(keysOf(Object.values(LEGACY_KEYS))).toEqual([]);
        expect(keysOf(Object.values(NEW_KEYS))).toEqual([]);
    });

    it('ошибка записи при миграции: старые целы, частичные новые откачены, повтор возможен', async () => {
        // сбой на втором новом ключе: первый уже записан частично
        failSetKey = NEW_KEYS.userId;

        const first = await freshSessionModule();
        seedLegacySession();

        expect(first.getSession()).toBeNull();
        expect(keysOf(Object.values(NEW_KEYS))).toEqual([]);
        expect(keysOf(Object.values(LEGACY_KEYS))).toEqual(Object.values(LEGACY_KEYS));

        // запись снова доступна — следующая попытка доводит миграцию до конца
        failSetKey = null;
        const retry = await freshSessionModule();

        expect(retry.getSession()).toEqual(VALID_SESSION);
        expect(keysOf(Object.values(NEW_KEYS))).toEqual(Object.values(NEW_KEYS));
        expect(keysOf(Object.values(LEGACY_KEYS))).toEqual([]);
    });

    it('clearSession(): удаляет только capsa.matrix.*', async () => {
        const { clearSession } = await freshSessionModule();
        seedNewSession();
        seedLegacySession({ userId: '@legacy:example.org' });
        data.set('other.app.data', 'keep-me');

        clearSession();

        expect(keysOf(Object.values(NEW_KEYS))).toEqual([]);
        // legacy-ключи и посторонние данные origin не трогаются
        expect(keysOf(Object.values(LEGACY_KEYS))).toEqual(Object.values(LEGACY_KEYS));
        expect(data.get('other.app.data')).toBe('keep-me');
    });
});
