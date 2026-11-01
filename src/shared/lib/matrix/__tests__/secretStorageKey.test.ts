// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { encodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import {
    clearSecretStorageKey,
    getSecretStorageKey,
    supplyRecoveryKey,
} from '../secret-storage-key';

afterEach(clearSecretStorageKey);

describe('secret storage recovery key', () => {
    it('декодирует ключ и возвращает его SDK только в памяти', async () => {
        const rawKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
        const encoded = encodeRecoveryKey(rawKey)!;
        supplyRecoveryKey(encoded);

        const result = await getSecretStorageKey({
            keys: {
                'key-id': {
                    algorithm: 'm.secret_storage.v1.aes-hmac-sha2',
                    iv: 'iv',
                    mac: 'mac',
                    name: 'Recovery key',
                    passphrase: { algorithm: 'm.pbkdf2', iterations: 1, salt: 'salt' },
                },
            },
        }, 'm.megolm_backup.v1');

        expect(result?.[0]).toBe('key-id');
        expect(result?.[1]).toEqual(rawKey);
        expect(localStorage.length).toBe(0);
    });

    it('удаляет ключ из callback после очистки', async () => {
        const rawKey = new Uint8Array(32).fill(1);
        supplyRecoveryKey(encodeRecoveryKey(rawKey)!);
        clearSecretStorageKey();

        await expect(
            getSecretStorageKey({ keys: {} }, 'm.megolm_backup.v1'),
        ).resolves.toBeNull();
    });
});
