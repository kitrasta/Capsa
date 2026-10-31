// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cleanup as cleanupDom,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../shared/lib/matrix', () => ({
    getSession: vi.fn(),
    cleanupLegacyCryptoStore: vi.fn(),
    matrixLifecycle: {
        subscribe: vi.fn(),
        getState: vi.fn(),
        start: vi.fn(),
    },
}));

vi.mock('../../widgets/Sidebar/Sidebar', () => ({
    default: () => <div>Sidebar</div>,
}));

vi.mock('../../widgets/Settings/SettingsMenu', () => ({
    default: () => <div>Settings menu</div>,
}));

import MainLayout from './MainLayout';
import {
    cleanupLegacyCryptoStore,
    getSession,
    matrixLifecycle,
} from '../../shared/lib/matrix';

const session = {
    accessToken: 'token',
    userId: '@me:example.org',
    deviceId: 'DEVICE',
};

const renderDirectChatLink = () =>
    render(
        <MemoryRouter initialEntries={['/chats/%21room%3Aexample.org']}>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route
                        path="/chats/:roomId"
                        element={<div>Protected chat</div>}
                    />
                </Route>
            </Routes>
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockReturnValue(session);
    vi.mocked(cleanupLegacyCryptoStore).mockResolvedValue(undefined);
    vi.mocked(matrixLifecycle.start).mockResolvedValue(undefined);
    vi.mocked(matrixLifecycle.subscribe).mockReturnValue(() => undefined);
});

afterEach(cleanupDom);

describe('MainLayout: запуск по прямой ссылке', () => {
    it('не монтирует защищённую страницу до готовности Matrix-клиента', async () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client starting',
            error: null,
        });

        renderDirectChatLink();

        expect(screen.getByText('Загрузка Matrix...')).toBeTruthy();
        expect(screen.queryByText('Protected chat')).toBeNull();
        await waitFor(() => {
            expect(matrixLifecycle.start).toHaveBeenCalledWith(session);
        });
    });

    it('монтирует страницу после перехода клиента в client ready', () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client ready',
            error: null,
        });

        renderDirectChatLink();

        expect(screen.getByText('Protected chat')).toBeTruthy();
    });
});
