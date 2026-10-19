import { beforeEach, describe, expect, it, vi } from 'vitest';

// storage мокаем: deleteDatabase требует indexedDB, а тесты живут в node
vi.mock('../storage', () => ({
    deleteDatabase: vi.fn(async () => {}),
}));

import { initCrypto } from '../crypto';
import { deleteDatabase } from '../storage';
import { CryptoInitError } from '../error-types';
import type { MatrixClient } from 'matrix-js-sdk';

// ---------------------------------------------------------------------------
// Ошибки crypto-инициализации обязаны быть CryptoInitError — иначе state-machine
// в lifecycle.ts никогда не попадёт в 'crypto error' и E2EE-сбой превратится
// в generic 'error' (регрессия: раньше initCrypto бросал обычный Error).
// ---------------------------------------------------------------------------

type FakeClient = {
    getUserId: ReturnType<typeof vi.fn>;
    initRustCrypto: ReturnType<typeof vi.fn>;
    getCrypto: ReturnType<typeof vi.fn>;
};

const makeClient = (overrides: Partial<FakeClient> = {}): MatrixClient =>
    ({
        getUserId: vi.fn(() => '@alice:example.org'),
        initRustCrypto: vi.fn(async () => {}),
        // по умолчанию крипто есть и готова — happy path без лишней настройки
        getCrypto: vi.fn(() => ({
            setDeviceIsolationMode: vi.fn(),
            isCrossSigningReady: vi.fn(async () => true),
            bootstrapCrossSigning: vi.fn(async () => {}),
        })),
        ...overrides,
    }) as unknown as MatrixClient;

beforeEach(() => {
    vi.mocked(deleteDatabase).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('initCrypto: ошибки — это CryptoInitError', () => {
    it('нет userId у клиента', async () => {
        const client = makeClient({ getUserId: vi.fn(() => null) });

        const error = await initCrypto(client).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(CryptoInitError);
        expect((error as Error).name).toBe('CryptoInitError');
    });

    it('initRustCrypto упал не по mismatch → CryptoInitError с cause', async () => {
        const cause = new Error('wasm failed');
        const client = makeClient({
            initRustCrypto: vi.fn(async () => {
                throw cause;
            }),
        });

        const error = await initCrypto(client).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(CryptoInitError);
        expect((error as Error).message).toBe(
            'Не удалось включить сквозное шифрование. Проверьте соединение и перезагрузите страницу.',
        );
        expect((error as Error).cause).toBe(cause);
    });

    it('mismatch + повторный initRustCrypto упал → CryptoInitError с cause', async () => {
        const retryCause = new Error('still broken');
        const client = makeClient({
            initRustCrypto: vi
                .fn()
                .mockRejectedValueOnce(new Error("Crypto store doesn't match"))
                .mockRejectedValueOnce(retryCause),
        });

        const error = await initCrypto(client).catch((e: unknown) => e);

        // чужая крипто-база удалена перед retry
        expect(deleteDatabase).toHaveBeenCalledTimes(2);
        expect(error).toBeInstanceOf(CryptoInitError);
        expect((error as Error).message).toBe(
            'Не удалось включить сквозное шифрование. Перейдите на другой аккаунт или очистите данные сайта.',
        );
        expect((error as Error).cause).toBe(retryCause);
    });

    it('initRustCrypto прошёл, но крипто не поднялась → CryptoInitError', async () => {
        const client = makeClient({ getCrypto: vi.fn(() => null) });

        const error = await initCrypto(client).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(CryptoInitError);
        expect((error as Error).message).toBe('Сквозное шифрование недоступно в этом окружении.');
    });
});

describe('initCrypto: happy path', () => {
    it('поднимает крипто и включает cross-signing-ready', async () => {
        const setDeviceIsolationMode = vi.fn();
        const client = makeClient({
            getCrypto: vi.fn(() => ({
                setDeviceIsolationMode,
                isCrossSigningReady: vi.fn(async () => true),
                bootstrapCrossSigning: vi.fn(async () => {}),
            })),
        });

        await expect(initCrypto(client)).resolves.toBeUndefined();
        expect(setDeviceIsolationMode).toHaveBeenCalledTimes(1);
    });
});
