// Сквозное шифрование: rust-криптобэкенд (wasm) и его IndexedDB-базы.
// Всё, что связано с крипто-ключами и крипто-базами, живёт здесь.
import type { MatrixClient } from 'matrix-js-sdk';
import { AllDevicesIsolationMode } from 'matrix-js-sdk/lib/crypto-api';
import { deleteDatabase } from './storage';
import { CryptoInitError } from './error-types';

// префикс крипто-базы rust-бэкенда. Важно: реальные имена баз —
// `${prefix}::matrix-sdk-crypto` и `${prefix}::matrix-sdk-crypto-meta`,
// поэтому удалять их надо через client.clearStores({ cryptoDatabasePrefix }),
// а не голом deleteDatabase по имени префикса
const CRYPTO_DB_PREFIX_BASE = 'capsa-crypto';

// scoped-префикс: база привязана к аккаунту, поэтому второй аккаунт
// в том же браузере физически не может увидеть чужие account-ключи
export const cryptoDbPrefix = (userId: string): string => {
    // имя IndexedDB не должно содержать ':' и прочие недопустимые символы
    const safeUserId = userId.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return `${CRYPTO_DB_PREFIX_BASE}:${safeUserId}`;
};

// имена баз rust-криптобэкенда для данного префикса
// (см. client.clearStores в matrix-js-sdk — SDK создаёт ровно эти две)
const rustCryptoDbNames = (prefix: string): string[] => [
    `${prefix}::matrix-sdk-crypto`,
    `${prefix}::matrix-sdk-crypto-meta`,
];

// имена крипто-баз аккаунта — для полного удаления при logout
export const cryptoDbNamesForUser = (userId: string): string[] =>
    rustCryptoDbNames(cryptoDbPrefix(userId));

// крипто-база принадлежит другому аккаунту: чужие account-ключи бесполезны и опасны.
// Лечится только удалением базы и повторной инициализацией
//
// TODO: классификация по тексту сообщения хрупкая — если в matrix-js-sdk
// появится typed error / errcode для этого случая, перейти на него
// (сейчас mismatch молча скатился бы в фатальную ошибку без retry)
const isAccountMismatchError = (error: unknown): boolean => {
    const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
    return /doesn'?t match|does not match/i.test(message);
};

// сквозное шифрование: rust-криптобэкенд (wasm)
// отправка/расшифровка в зашифрованных комнатах дальше работает автоматически
export const initCrypto = async (client: MatrixClient): Promise<void> => {
    const userId = client.getUserId();
    if (!userId) {
        throw new CryptoInitError('Cannot init crypto: client has no userId');
    }
    const prefix = cryptoDbPrefix(userId);
    const opts = { useIndexedDB: true, cryptoDatabasePrefix: prefix };

    try {
        await client.initRustCrypto(opts);
    } catch (error) {
        if (!isAccountMismatchError(error)) {
            console.error('Failed to initialize crypto:', error);
            throw new CryptoInitError(
                'Не удалось включить сквозное шифрование. Проверьте соединение и перезагрузите страницу.',
                { cause: error },
            );
        }

        // база с чужими ключами — удаляем ТОЛЬКО её и пробуем ещё раз (один раз,
        // иначе зациклимся на повторяющейся ошибке).
        // clearStores здесь не используем: он чистит и room-стор, а проблема
        // только в крипто-базе — полный ресинк комнат нам ни к чему
        console.warn(
            'Crypto store belongs to another account — clearing it and retrying once',
            error,
        );
        try {
            await Promise.all(rustCryptoDbNames(prefix).map(deleteDatabase));
            await client.initRustCrypto(opts);
        } catch (retryError) {
            console.error('Failed to initialize crypto after reset:', retryError);
            throw new CryptoInitError(
                'Не удалось включить сквозное шифрование. Перейдите на другой аккаунт или очистите данные сайта.',
                { cause: retryError },
            );
        }
    }

    const crypto = client.getCrypto();
    if (!crypto) {
        // initRustCrypto не бросил ошибку, но и крипто не дал — тихо игнорировать нельзя
        throw new CryptoInitError('Сквозное шифрование недоступно в этом окружении.');
    }

    // ключи шифрования расдаются всем устройствам в комнате:
    // без верификации устройств сообщения всё равно доставляются
    crypto.setDeviceIsolationMode(new AllDevicesIsolationMode(false));

    // Cross-signing здесь намеренно НЕ bootstrap'им автоматически. Для
    // существующего аккаунта без recovery key SDK мог бы создать новые
    // локальные ключи вместо восстановления старых из Secret Storage.
    // Восстановление выполняется явно через EncryptionRecoveryGate.
};

// миграция: до scoped-именования крипто-база называлась просто 'capsa-crypto'.
// У старых установок она остаётся сиротой — её больше никто не использует
// и никогда не удалит, так что чистим один раз при старте
export const cleanupLegacyCryptoStore = async (): Promise<void> => {
    try {
        await deleteDatabase(CRYPTO_DB_PREFIX_BASE);
    } catch (error) {
        // мусорная база не должна ломать запуск — максимум, останется висяк
        console.warn('Failed to remove legacy crypto store:', error);
    }
};
