import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// config.ts читает import.meta.env на уровне модуля — для каждого сценария
// перечитываем модуль заново с нужными переменными окружения
const loadConfig = async (env: Record<string, string | undefined>) => {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
            vi.stubEnv(key, '');
        } else {
            vi.stubEnv(key, value);
        }
    }
    return import('../config');
};

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('MATRIX_HOMESERVER_URL', () => {
    it('читается из окружения', async () => {
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: 'https://matrix.example.com',
        });
        expect(config.MATRIX_HOMESERVER_URL).toBe('https://matrix.example.com');
    });

    it('срезает завершающие слеши', async () => {
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: 'https://matrix.example.com///',
        });
        expect(config.MATRIX_HOMESERVER_URL).toBe('https://matrix.example.com');
    });

    it('без переменной — пустая строка', async () => {
        const config = await loadConfig({ VITE_MATRIX_HOMESERVER_URL: undefined });
        expect(config.MATRIX_HOMESERVER_URL).toBe('');
    });
});

describe('MATRIX_SERVER_NAME', () => {
    it('читается из окружения', async () => {
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: 'https://matrix.example.com',
            VITE_MATRIX_SERVER_NAME: 'example.com',
        });
        expect(config.MATRIX_SERVER_NAME).toBe('example.com');
    });

    it('без переменной — хост адреса API', async () => {
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: 'https://matrix.example.com',
            VITE_MATRIX_SERVER_NAME: undefined,
        });
        expect(config.MATRIX_SERVER_NAME).toBe('matrix.example.com');
    });

    it('без обоих — пустая строка', async () => {
        // vitest подхватывает реальный .env — обе переменные глушим явно
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: undefined,
            VITE_MATRIX_SERVER_NAME: undefined,
        });
        expect(config.MATRIX_SERVER_NAME).toBe('');
    });
});

describe('requireHomeserverUrl', () => {
    it('с заданным адресом возвращает его', async () => {
        const config = await loadConfig({
            VITE_MATRIX_HOMESERVER_URL: 'https://matrix.example.com',
        });
        expect(config.requireHomeserverUrl()).toBe('https://matrix.example.com');
    });

    it('без адреса бросает ConfigError с подсказкой', async () => {
        const config = await loadConfig({ VITE_MATRIX_HOMESERVER_URL: undefined });
        expect(() => config.requireHomeserverUrl()).toThrowError(
            /VITE_MATRIX_HOMESERVER_URL/,
        );
        try {
            config.requireHomeserverUrl();
        } catch (error) {
            // ошибка конфигурации — отдельный класс ConfigError,
            // UI показывает её как есть, а не как «неверный пароль»
            expect((error as Error).name).toBe('ConfigError');
        }
    });
});
