// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DevicesSettingsPage from './DevicesSettingsPage';

const mocks = vi.hoisted(() => ({
    getDevices: vi.fn(),
    getDeviceId: vi.fn(() => 'CURRENT'),
    setDeviceDetails: vi.fn(),
}));

vi.mock('../shared/lib/matrix', () => ({
    getClient: () => ({
        getDevices: mocks.getDevices,
        getDeviceId: mocks.getDeviceId,
        setDeviceDetails: mocks.setDeviceDetails,
    }),
}));

const devices = [
    {
        device_id: 'OTHER',
        display_name: 'Element',
        last_seen_ip: '198.51.100.2',
        last_seen_ts: 1_700_000_000_000,
    },
    {
        device_id: 'CURRENT',
        display_name: 'Capsa Web',
        last_seen_ip: '192.0.2.1',
        last_seen_ts: 1_600_000_000_000,
    },
];

describe('DevicesSettingsPage', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDeviceId.mockReturnValue('CURRENT');
        mocks.getDevices.mockResolvedValue({ devices });
        mocks.setDeviceDetails.mockResolvedValue({});
    });

    it('показывает загрузку до ответа Matrix', () => {
        mocks.getDevices.mockReturnValue(new Promise(() => undefined));

        render(<DevicesSettingsPage />);

        expect(screen.getByText('Загрузка устройств…')).toBeTruthy();
    });

    it('отмечает текущее устройство, показывает метаданные и ставит его первым', async () => {
        render(<DevicesSettingsPage />);

        const current = await screen.findByText('CURRENT');
        const rows = screen.getAllByRole('listitem');
        expect(rows[0].textContent).toContain('CURRENT');
        expect(within(rows[0]).getByText('Это устройство')).toBeTruthy();
        expect(current).toBeTruthy();
        expect(rows[0].textContent).toContain('192.0.2.1');
        expect(rows[1].textContent).toContain('198.51.100.2');
    });

    it('переименовывает устройство через Matrix и обновляет список', async () => {
        render(<DevicesSettingsPage />);
        const currentId = await screen.findByText('CURRENT');
        const row = currentId.closest('li')!;

        fireEvent.click(within(row).getByRole('button', { name: 'Переименовать' }));
        fireEvent.change(screen.getByDisplayValue('Capsa Web'), {
            target: { value: 'Рабочий браузер' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

        await waitFor(() => expect(mocks.setDeviceDetails).toHaveBeenCalledWith(
            'CURRENT',
            { display_name: 'Рабочий браузер' },
        ));
        await waitFor(() => expect(mocks.getDevices).toHaveBeenCalledTimes(2));
    });

    it('обновляет список вручную', async () => {
        render(<DevicesSettingsPage />);
        await screen.findByText('CURRENT');

        fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));

        await waitFor(() => expect(mocks.getDevices).toHaveBeenCalledTimes(2));
    });

    it('показывает ошибку загрузки вместо пустого списка', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.getDevices.mockRejectedValue(new Error('network'));

        render(<DevicesSettingsPage />);

        expect((await screen.findByRole('alert')).textContent).toContain(
            'Не удалось загрузить устройства',
        );
    });
});
