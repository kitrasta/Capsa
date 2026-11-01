import type { MatrixClient } from 'matrix-js-sdk';
import type {
    ImportRoomKeyProgressData,
    KeyBackupRestoreResult,
} from 'matrix-js-sdk/lib/crypto-api';
import { getClient } from './client';
import {
    clearSecretStorageKey,
    supplyRecoveryKey,
} from './secret-storage-key';

export interface EncryptionRecoveryStatus {
    required: boolean;
    hasBackup: boolean;
}

const requireCrypto = (client: MatrixClient) => {
    const crypto = client.getCrypto();
    if (!crypto) throw new Error('E2EE is not initialized');
    return crypto;
};

export const getEncryptionRecoveryStatus = async (): Promise<EncryptionRecoveryStatus> => {
    const crypto = requireCrypto(getClient());
    const [crossSigningReady, crossSigningStatus, backupInfo, backupKey] =
        await Promise.all([
            crypto.isCrossSigningReady(),
            crypto.getCrossSigningStatus(),
            crypto.getKeyBackupInfo(),
            crypto.getSessionBackupPrivateKey(),
        ]);

    // Новому аккаунту без существующих cross-signing ключей восстановление
    // не требуется — ему нужна первичная настройка, а не старый recovery key.
    const needsCrossSigningRecovery =
        !crossSigningReady && crossSigningStatus.publicKeysOnDevice;

    let needsBackupRecovery = false;
    if (backupInfo) {
        const trust = await crypto.isKeyBackupTrusted(backupInfo);
        needsBackupRecovery = !trust.trusted || backupKey === null;
    }

    return {
        required: needsCrossSigningRecovery || needsBackupRecovery,
        hasBackup: backupInfo !== null,
    };
};

/** Восстановить cross-signing и room keys из существующего Secret Storage. */
export const recoverEncryptionWithKey = async (
    encodedRecoveryKey: string,
    progressCallback?: (progress: ImportRoomKeyProgressData) => void,
): Promise<KeyBackupRestoreResult> => {
    const crypto = requireCrypto(getClient());
    supplyRecoveryKey(encodedRecoveryKey);

    try {
        // Если приватные cross-signing ключи есть в 4S, SDK импортирует их
        // и подпишет текущее устройство. Новые ключи здесь не создаём намеренно.
        await crypto.bootstrapCrossSigning({});

        const backupInfo = await crypto.getKeyBackupInfo();
        if (!backupInfo) return { imported: 0, total: 0 };

        // Загружаем backup key из 4S, проверяем соответствие версии и только
        // затем импортируем room keys. Существующий backup не перезаписываем.
        await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
        const result = await crypto.restoreKeyBackup({ progressCallback });
        await crypto.checkKeyBackupAndEnable();
        return result;
    } catch (error) {
        // Не оставляем неправильный ключ в callback для следующих операций.
        clearSecretStorageKey();
        throw error;
    }
};

/**
 * После SAS-верификации другой клиент может передать backup key через secret
 * sharing. Восстанавливаем историю, если ключ действительно появился.
 */
export const restoreKeysAfterVerification = async (): Promise<
    KeyBackupRestoreResult & { backupRestored: boolean }
> => {
    const crypto = requireCrypto(getClient());
    const backupInfo = await crypto.getKeyBackupInfo();
    const backupKey = await crypto.getSessionBackupPrivateKey();
    if (!backupInfo || !backupKey) {
        return { imported: 0, total: 0, backupRestored: false };
    }

    const result = await crypto.restoreKeyBackup();
    await crypto.checkKeyBackupAndEnable();
    return { ...result, backupRestored: true };
};

export const requestOwnDeviceVerification = async () =>
    requireCrypto(getClient()).requestOwnUserVerification();
