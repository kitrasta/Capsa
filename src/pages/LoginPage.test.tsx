// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => {
    class ConfigError extends Error {}
    class HomeserverDiscoveryError extends Error {}
    const loginResult = {
        access_token: 'access-token',
        user_id: '@alice:matrix.org',
        device_id: 'DEVICE1',
    };
    const registrationResult = {
        access_token: 'new-access-token',
        user_id: '@new:capsachat.org',
        device_id: 'NEW_DEVICE',
    };
    const target = {
        identifier: '@alice:matrix.org',
        homeserverUrl: 'https://matrix-client.matrix.org',
        serverName: 'matrix.org',
    };
    return {
        ConfigError,
        HomeserverDiscoveryError,
        loginResult,
        registrationResult,
        target,
        resolve: vi.fn(),
        login: vi.fn(),
        save: vi.fn(),
        clear: vi.fn(),
        getSession: vi.fn(() => null),
        validate: vi.fn(),
        getCapsa: vi.fn(() => ({
            homeserverUrl: 'https://matrix.capsachat.org',
            serverName: 'capsachat.org',
        })),
    };
});

vi.mock('../shared/lib/matrix', () => ({
    loginUser: mocks.login,
    validateLoginResponse: mocks.validate,
    saveSession: mocks.save,
    getSession: mocks.getSession,
    clearSession: mocks.clear,
    ConfigError: mocks.ConfigError,
    HomeserverDiscoveryError: mocks.HomeserverDiscoveryError,
    isForbiddenError: (error: unknown) => (
        typeof error === 'object' && error !== null &&
        (error as { errcode?: string }).errcode === 'M_FORBIDDEN'
    ),
    matrixErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Matrix error',
    resolveLoginTarget: mocks.resolve,
    getCapsaHomeserver: mocks.getCapsa,
}));

vi.mock('../widgets/Auth/RegistrationForm', () => ({
    default: ({ onRegistered }: { onRegistered: (result: unknown) => void }) => (
        <button onClick={() => onRegistered(mocks.registrationResult)}>Завершить регистрацию</button>
    ),
}));

import LoginPage from './LoginPage';

const Path = () => <div data-testid="path">{useLocation().pathname}</div>;

function renderAuth() {
    return render(
        <MemoryRouter initialEntries={['/auth']}>
            <Routes>
                <Route path="/auth" element={<><LoginPage /><Path /></>} />
                <Route path="/chats" element={<><div>Чаты</div><Path /></>} />
            </Routes>
        </MemoryRouter>,
    );
}

function fillLogin() {
    fireEvent.change(screen.getByLabelText('Matrix ID или логин'), {
        target: { value: '@alice:matrix.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('LoginPage tabs', () => {
    it('переключает вход и регистрацию без смены /auth', () => {
        renderAuth();

        fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
        expect(screen.getByRole('button', { name: 'Завершить регистрацию' })).toBeTruthy();
        expect(screen.getByTestId('path').textContent).toBe('/auth');

        fireEvent.click(screen.getByRole('tab', { name: 'Вход' }));
        expect(screen.getByLabelText('Matrix ID или логин')).toBeTruthy();
        expect(screen.getByTestId('path').textContent).toBe('/auth');
    });

    it('сохраняет Capsa server после регистрации', async () => {
        renderAuth();
        fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));

        fireEvent.click(screen.getByRole('button', { name: 'Завершить регистрацию' }));

        expect(await screen.findByText('Чаты')).toBeTruthy();
        expect(mocks.save).toHaveBeenCalledWith({
            accessToken: 'new-access-token',
            userId: '@new:capsachat.org',
            deviceId: 'NEW_DEVICE',
            homeserverUrl: 'https://matrix.capsachat.org',
            serverName: 'capsachat.org',
        });
    });
});

describe('LoginPage federated login', () => {
    it('входит через discovered homeserver и сохраняет его в сессии', async () => {
        mocks.resolve.mockResolvedValue(mocks.target);
        mocks.login.mockResolvedValue(mocks.loginResult);
        renderAuth();
        fillLogin();

        fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

        expect(await screen.findByText('Чаты')).toBeTruthy();
        expect(mocks.resolve).toHaveBeenCalledWith('@alice:matrix.org');
        expect(mocks.login).toHaveBeenCalledWith(mocks.target, 'password');
        expect(mocks.save).toHaveBeenCalledWith({
            accessToken: 'access-token',
            userId: '@alice:matrix.org',
            deviceId: 'DEVICE1',
            homeserverUrl: 'https://matrix-client.matrix.org',
            serverName: 'matrix.org',
        });
    });

    it('показывает discovery error отдельно от неверного пароля', async () => {
        const error = new mocks.HomeserverDiscoveryError('Не удалось определить Matrix-сервер.');
        mocks.resolve.mockRejectedValue(error);
        renderAuth();
        fillLogin();

        fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

        expect(await screen.findByText('Не удалось определить Matrix-сервер.')).toBeTruthy();
        expect(mocks.login).not.toHaveBeenCalled();
    });

    it('сохраняет сообщение о неверном логине или пароле', async () => {
        mocks.resolve.mockResolvedValue(mocks.target);
        mocks.login.mockRejectedValue({ errcode: 'M_FORBIDDEN' });
        renderAuth();
        fillLogin();

        fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

        expect(await screen.findByText('Неверный логин или пароль.')).toBeTruthy();
    });

    it('блокирует submit, пока вход выполняется', async () => {
        let resolveLogin!: (value: typeof mocks.loginResult) => void;
        mocks.resolve.mockResolvedValue(mocks.target);
        mocks.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
        renderAuth();
        fillLogin();

        fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
        const submit = await screen.findByRole('button', { name: 'Вход…' });
        expect((submit as HTMLButtonElement).disabled).toBe(true);

        await act(async () => resolveLogin(mocks.loginResult));
        expect(await screen.findByText('Чаты')).toBeTruthy();
    });

    it('не завершает устаревший вход после переключения на регистрацию', async () => {
        let resolveLogin!: (value: typeof mocks.loginResult) => void;
        mocks.resolve.mockResolvedValue(mocks.target);
        mocks.login.mockImplementation(() => new Promise((resolve) => { resolveLogin = resolve; }));
        renderAuth();
        fillLogin();
        fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
        await waitFor(() => expect(mocks.login).toHaveBeenCalled());

        fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
        await act(async () => resolveLogin(mocks.loginResult));

        expect(mocks.save).not.toHaveBeenCalled();
        expect(screen.getByTestId('path').textContent).toBe('/auth');
        expect(screen.getByRole('button', { name: 'Завершить регистрацию' })).toBeTruthy();
    });
});
