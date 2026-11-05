// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationsSettingsPage from './NotificationsSettingsPage';
import { getMessageNotificationsEnabled } from '../shared/lib/notifications';

class NotificationMock {
    static permission: NotificationPermission = 'default';
    static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    static instances: NotificationMock[] = [];
    onclick: (() => void) | null = null;
    title: string;
    options?: NotificationOptions;

    constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        this.options = options;
        NotificationMock.instances.push(this);
    }
}

describe('NotificationsSettingsPage', () => {
    beforeEach(() => {
        localStorage.clear();
        NotificationMock.permission = 'default';
        NotificationMock.instances = [];
        NotificationMock.requestPermission.mockReset().mockImplementation(async () => {
            NotificationMock.permission = 'granted';
            return 'granted';
        });
        vi.stubGlobal('Notification', NotificationMock);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('запрашивает разрешение и включает уведомления', async () => {
        render(<NotificationsSettingsPage />);
        const toggle = screen.getByRole('checkbox', {
            name: /Уведомления о новых сообщениях/,
        }) as HTMLInputElement;

        fireEvent.click(toggle);

        await waitFor(() => expect(NotificationMock.requestPermission).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(toggle.checked).toBe(true));
        expect(getMessageNotificationsEnabled()).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Проверить уведомление' }));
        expect(NotificationMock.instances).toHaveLength(1);
        expect(NotificationMock.instances[0].options?.body).toContain('Capsa');
    });

    it('не включает настройку при отклонённом разрешении', async () => {
        NotificationMock.requestPermission.mockImplementation(async () => {
            NotificationMock.permission = 'denied';
            return 'denied';
        });
        render(<NotificationsSettingsPage />);
        const toggle = screen.getByRole('checkbox') as HTMLInputElement;

        fireEvent.click(toggle);

        await screen.findByText(/заблокированы/);
        expect(toggle.checked).toBe(false);
        expect(getMessageNotificationsEnabled()).toBe(false);
    });

    it('объясняет отсутствие поддержки Notification API', () => {
        vi.stubGlobal('Notification', undefined);

        render(<NotificationsSettingsPage />);

        expect(screen.getByText(/не поддерживает уведомления/)).toBeTruthy();
        expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    });
});
