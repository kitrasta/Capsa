import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import type { KeyBackupInfo } from 'matrix-js-sdk/lib/crypto-api';

vi.mock('../client', () => ({ getClient: vi.fn() }));
vi.mock('../secret-storage-key', () => ({
    supplyRecoveryKey: vi.fn(),
    clearSecretStorageKey: vi.fn(),
}));

import { getClient } from '../client';
import {
    getEncryptionRecoveryStatus,
    recoverEncryptionWithKey,
    requestOwnDeviceVerification,
    restoreKeysAfterVerification,
} from '../encryption-recovery';
import {
    clearSecretStorageKey,
    supplyRecoveryKey,
} from '../secret-storage-key';

const backupInfo = { version: '1' } as KeyBackupInfo;

const makeCrypto = () => ({
    isCrossSigningReady: vi.fn(async () => true),
    getCrossSigningStatus: vi.fn(async () => ({ publicKeysOnDevice: true })),
    getKeyBackupInfo: vi.fn(async (): Promise<KeyBackupInfo | null> => null),
    getSessionBackupPrivateKey: vi.fn(
        async (): Promise<Uint8Array<ArrayBuffer> | null> => new Uint8Array([1]),
    ),
    isKeyBackupTrusted: vi.fn(async () => ({ trusted: true, matchesDecryptionKey: true })),
    bootstrapCrossSigning: vi.fn(async () => undefined),
    loadSessionBackupPrivateKeyFromSecretStorage: vi.fn(async () => undefined),
    restoreKeyBackup: vi.fn(async () => ({ imported: 2, total: 3 })),
    checkKeyBackupAndEnable: vi.fn(async () => null),
    requestOwnUserVerification: vi.fn(async () => ({ request: true })),
});

const setup = (crypto: ReturnType<typeof makeCrypto>) => {
    vi.mocked(getClient).mockReturnValue({
        getCrypto: () => crypto,
    } as unknown as MatrixClient);
    return crypto;
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('getEncryptionRecoveryStatus', () => {
    it('не требует recovery key у нового аккаунта без старых ключей', async () => {
        const crypto = setup(makeCrypto());
        crypto.isCrossSigningReady.mockResolvedValue(false);
        crypto.getCrossSigningStatus.mockResolvedValue({ publicKeysOnDevice: false });

        await expect(getEncryptionRecoveryStatus()).resolves.toEqual({
            required: false,
            hasBackup: false,
        });
    });

    it('определяет существующий аккаунт с неподтверждённым cross-signing', async () => {
        const crypto = setup(makeCrypto());
        crypto.isCrossSigningReady.mockResolvedValue(false);

        await expect(getEncryptionRecoveryStatus()).resolves.toEqual({
            required: true,
            hasBackup: false,
        });
    });

    it('требует восстановление, если backup не доверен или его ключ отсутствует', async () => {
        const crypto = setup(makeCrypto());
        crypto.getKeyBackupInfo.mockResolvedValue(backupInfo);
        crypto.isKeyBackupTrusted.mockResolvedValue({ trusted: false, matchesDecryptionKey: false });
        crypto.getSessionBackupPrivateKey.mockResolvedValue(null);

        await expect(getEncryptionRecoveryStatus()).resolves.toEqual({
            required: true,
            hasBackup: true,
        });
    });

    it('не показывает окно при готовом cross-signing и доступном backup key', async () => {
        const crypto = setup(makeCrypto());
        crypto.getKeyBackupInfo.mockResolvedValue(backupInfo);

        await expect(getEncryptionRecoveryStatus()).resolves.toEqual({
            required: false,
            hasBackup: true,
        });
    });
});

describe('recoverEncryptionWithKey', () => {
    it('восстанавливает cross-signing и backup без его пересоздания', async () => {
        const crypto = setup(makeCrypto());
        crypto.getKeyBackupInfo.mockResolvedValue(backupInfo);

        await expect(recoverEncryptionWithKey('encoded-key')).resolves.toEqual({
            imported: 2,
            total: 3,
        });

        expect(supplyRecoveryKey).toHaveBeenCalledWith('encoded-key');
        expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith({});
        expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalled();
        expect(crypto.restoreKeyBackup).toHaveBeenCalled();
        expect(crypto.checkKeyBackupAndEnable).toHaveBeenCalled();
        expect(clearSecretStorageKey).not.toHaveBeenCalled();
    });

    it('очищает ключ из памяти при ошибке восстановления', async () => {
        const crypto = setup(makeCrypto());
        crypto.bootstrapCrossSigning.mockRejectedValue(new Error('wrong key'));

        await expect(recoverEncryptionWithKey('wrong-key')).rejects.toThrow('wrong key');

        expect(clearSecretStorageKey).toHaveBeenCalled();
        expect(crypto.restoreKeyBackup).not.toHaveBeenCalled();
    });
});

describe('restoreKeysAfterVerification', () => {
    it('восстанавливает backup, если другой клиент передал ключ', async () => {
        const crypto = setup(makeCrypto());
        crypto.getKeyBackupInfo.mockResolvedValue(backupInfo);

        await expect(restoreKeysAfterVerification()).resolves.toEqual({
            imported: 2,
            total: 3,
            backupRestored: true,
        });
        expect(crypto.restoreKeyBackup).toHaveBeenCalled();
    });

    it('не выдаёт верификацию за восстановление истории без backup key', async () => {
        const crypto = setup(makeCrypto());
        crypto.getKeyBackupInfo.mockResolvedValue(backupInfo);
        crypto.getSessionBackupPrivateKey.mockResolvedValue(null);

        await expect(restoreKeysAfterVerification()).resolves.toEqual({
            imported: 0,
            total: 0,
            backupRestored: false,
        });
        expect(crypto.restoreKeyBackup).not.toHaveBeenCalled();
    });
});

describe('requestOwnDeviceVerification', () => {
    it('запрашивает верификацию собственных устройств через SDK', async () => {
        const crypto = setup(makeCrypto());

        await expect(requestOwnDeviceVerification()).resolves.toEqual({ request: true });
        expect(crypto.requestOwnUserVerification).toHaveBeenCalled();
    });
});
