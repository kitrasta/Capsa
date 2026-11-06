// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cleanup as cleanupDom,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MatrixClient } from 'matrix-js-sdk';
import type { ReactNode } from 'react';

vi.mock('../../shared/lib/matrix', () => {
    // стабильный snapshot: useSyncExternalStore сравнивает ссылку,
    // новый объект на каждый вызов = бесконечный цикл рендеров
    const otkState = { conflict: false };
    return {
        getClient: vi.fn(),
        getSession: vi.fn(),
        cleanupLegacyCryptoStore: vi.fn(),
        otkConflict: {
            getState: vi.fn(() => otkState),
            subscribe: vi.fn(() => () => undefined),
        },
        matrixLifecycle: {
            subscribe: vi.fn(),
            getState: vi.fn(),
            start: vi.fn(),
        },
    };
});

vi.mock('../../widgets/Sidebar/Sidebar', () => ({
    default: () => <div>Sidebar</div>,
}));

vi.mock('../../widgets/SpaceWorkspace/SpaceWorkspaceContext', () => ({
    SpaceWorkspaceProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../../widgets/SpaceWorkspace/SpaceSidebar', () => ({
    default: () => <div>Space sidebar</div>,
}));

vi.mock('../../widgets/Settings/SettingsMenu', () => ({
    default: () => <div>Settings menu</div>,
}));

vi.mock('../../widgets/EncryptionRecovery/EncryptionRecovery', () => ({
    default: () => null,
}));

import MainLayout from './MainLayout';
import styles from './MainLayout.module.css';
import {
    cleanupLegacyCryptoStore,
    getClient,
    getSession,
    matrixLifecycle,
} from '../../shared/lib/matrix';

const session = {
    accessToken: 'token',
    userId: '@me:example.org',
    deviceId: 'DEVICE',
    homeserverUrl: 'https://matrix.example.org',
    serverName: 'example.org',
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

const renderSpaceLink = (roomId?: string) => {
    const spacePath = '/spaces/%21space%3Aexample.org';
    const initialEntry = roomId
        ? `${spacePath}/chats/${encodeURIComponent(roomId)}`
        : spacePath;
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route element={<MainLayout />}>
                    <Route path="/spaces/:spaceId" element={<div>Space overview</div>} />
                    <Route
                        path="/spaces/:spaceId/chats/:roomId"
                        element={<div>Protected Space chat</div>}
                    />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockReturnValue({
        getSyncState: () => null,
        on: vi.fn(),
        off: vi.fn(),
    } as unknown as MatrixClient);
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

        const { container } = renderDirectChatLink();

        expect(screen.getByText('Protected chat')).toBeTruthy();
        expect(
            (container.firstChild as Element).classList.contains(styles.roomOpen),
        ).toBe(true);
    });

    it('включает мобильный режим с панелью разделов для настроек', () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client ready',
            error: null,
        });
        const { container } = render(
            <MemoryRouter initialEntries={['/settings/general']}>
                <Routes>
                    <Route element={<MainLayout />}>
                        <Route path="/settings/general" element={<div>General</div>} />
                    </Route>
                </Routes>
            </MemoryRouter>,
        );

        expect(
            (container.firstChild as Element).classList.contains(styles.settings),
        ).toBe(true);
        expect(screen.getByText('Settings menu')).toBeTruthy();
        expect(screen.getByText('General')).toBeTruthy();
    });

    it('использует SpaceSidebar и мобильный overview-класс на маршруте Space', () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client ready',
            error: null,
        });

        const { container } = renderSpaceLink();
        const layout = container.firstChild as Element;

        expect(screen.getByText('Space sidebar')).toBeTruthy();
        expect(screen.queryByText('Sidebar')).toBeNull();
        expect(screen.getByText('Space overview')).toBeTruthy();
        expect(layout.classList.contains(styles.spaceOverview)).toBe(true);
        expect(layout.classList.contains(styles.roomOpen)).toBe(false);
    });

    it('применяет roomOpen к комнате Space и сохраняет SpaceSidebar', () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client ready',
            error: null,
        });

        const { container } = renderSpaceLink('!room:example.org');
        const layout = container.firstChild as Element;

        expect(screen.getByText('Space sidebar')).toBeTruthy();
        expect(screen.getByText('Protected Space chat')).toBeTruthy();
        expect(layout.classList.contains(styles.roomOpen)).toBe(true);
        expect(layout.classList.contains(styles.spaceOverview)).toBe(false);
    });

    it('не монтирует Space sidebar и контент до готовности Matrix', () => {
        vi.mocked(matrixLifecycle.getState).mockReturnValue({
            state: 'client starting',
            error: null,
        });

        renderSpaceLink('!room:example.org');

        expect(screen.queryByText('Space sidebar')).toBeNull();
        expect(screen.queryByText('Protected Space chat')).toBeNull();
    });
});
