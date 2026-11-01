import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';

// Ключ существует только в памяти вкладки. Он нужен SDK для чтения Secret
// Storage во время восстановления и не записывается в localStorage/IndexedDB.
let privateKey: Uint8Array<ArrayBuffer> | null = null;
let preferredKeyId: string | null = null;

export const supplyRecoveryKey = (encodedKey: string): void => {
    // decodeRecoveryKey сам проверяет формат, длину, префикс и parity.
    privateKey = decodeRecoveryKey(encodedKey.replace(/\s/g, ''));
    preferredKeyId = null;
};

export const getSecretStorageKey: NonNullable<CryptoCallbacks['getSecretStorageKey']> = async ({
    keys,
}) => {
    if (!privateKey) return null;
    const keyId =
        preferredKeyId && keys[preferredKeyId]
            ? preferredKeyId
            : Object.keys(keys)[0];
    return keyId ? [keyId, privateKey] : null;
};

export const cacheSecretStorageKey: NonNullable<CryptoCallbacks['cacheSecretStorageKey']> = (
    keyId,
    _keyInfo,
    key,
) => {
    privateKey = key;
    preferredKeyId = keyId;
};

export const clearSecretStorageKey = (): void => {
    privateKey?.fill(0);
    privateKey = null;
    preferredKeyId = null;
};
