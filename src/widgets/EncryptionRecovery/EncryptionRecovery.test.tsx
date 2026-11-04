// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../shared/lib/matrix', () => ({
    getEncryptionRecoveryStatus: vi.fn(),
    recoverEncryptionWithKey: vi.fn(),
    requestOwnDeviceVerification: vi.fn(),
    restoreKeysAfterVerification: vi.fn(),
}));

import EncryptionRecoveryGate from './EncryptionRecovery';
import {
    getEncryptionRecoveryStatus,
    recoverEncryptionWithKey,
} from '../../shared/lib/matrix';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(cleanup);

describe('EncryptionRecoveryGate', () => {
    it('не показывает окно, если восстановление не требуется', async () => {
        vi.mocked(getEncryptionRecoveryStatus).mockResolvedValue({
            required: false,
            hasBackup: true,
        });
        render(<EncryptionRecoveryGate />);

        await waitFor(() => expect(getEncryptionRecoveryStatus).toHaveBeenCalled());
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('восстанавливает ключи через recovery key и закрывает окно', async () => {
        vi.mocked(getEncryptionRecoveryStatus).mockResolvedValue({
            required: true,
            hasBackup: true,
        });
        vi.mocked(recoverEncryptionWithKey).mockResolvedValue({ imported: 5, total: 5 });
        render(<EncryptionRecoveryGate />);

        expect(await screen.findByRole('dialog')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Ключ восстановления'), {
            target: { value: 'test recovery key' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Восстановить сообщения' }));

        expect(await screen.findByText('Готово. Восстановлено ключей: 5 из 5.')).toBeTruthy();
        expect(recoverEncryptionWithKey).toHaveBeenCalledWith('test recovery key');
        fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('объясняет пустой backup вместо голого «0»', async () => {
        vi.mocked(getEncryptionRecoveryStatus).mockResolvedValue({
            required: true,
            hasBackup: true,
        });
        vi.mocked(recoverEncryptionWithKey).mockResolvedValue({ imported: 0, total: 0 });
        render(<EncryptionRecoveryGate />);

        expect(await screen.findByRole('dialog')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Ключ восстановления'), {
            target: { value: 'test recovery key' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Восстановить сообщения' }));

        expect(
            await screen.findByText(/Резервная копия не содержит ключей/),
        ).toBeTruthy();
        expect(screen.queryByText(/Восстановлено ключей: 0\./)).toBeNull();
    });

    it('показывает «0 из N», когда backup не пуст, но ничего не импортировано', async () => {
        vi.mocked(getEncryptionRecoveryStatus).mockResolvedValue({
            required: true,
            hasBackup: true,
        });
        vi.mocked(recoverEncryptionWithKey).mockResolvedValue({ imported: 0, total: 12 });
        render(<EncryptionRecoveryGate />);

        expect(await screen.findByRole('dialog')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Ключ восстановления'), {
            target: { value: 'test recovery key' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Восстановить сообщения' }));

        expect(
            await screen.findByText(/Восстановлено ключей: 0 из 12/),
        ).toBeTruthy();
        expect(screen.queryByText(/^Готово\./)).toBeNull();
    });
});
