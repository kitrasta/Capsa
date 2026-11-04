import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('matrix-js-sdk', async (importOriginal) => ({
    ...await importOriginal<typeof import('matrix-js-sdk')>(),
    createClient: mocks.createClient,
}));

beforeEach(() => {
    vi.resetModules();
    mocks.createClient.mockReset();
    vi.stubEnv('VITE_MATRIX_HOMESERVER_URL', 'https://matrix.capsachat.org');
    vi.stubEnv('VITE_MATRIX_SERVER_NAME', 'capsachat.org');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

const loadModules = async () => ({
    sdk: await import('matrix-js-sdk'),
    registration: await import('../registration'),
});

describe('startEmailRegistration', () => {
    it('ждёт подтверждения email, повторно шлёт письмо и завершает тот же UIA session', async () => {
        const { sdk, registration } = await loadModules();
        const success = {
            user_id: '@alice:capsachat.org',
            access_token: 'access-token',
            device_id: 'DEVICE1',
        };
        const uiaError = new sdk.MatrixError({
            errcode: 'M_UNAUTHORIZED',
            error: 'Email confirmation required',
            session: 'uia-session',
            flows: [{ stages: [sdk.AuthType.Email] }],
        }, 401);
        const registerRequest = vi.fn()
            .mockRejectedValueOnce(uiaError)
            .mockResolvedValue(success);
        const requestRegisterEmailToken = vi.fn()
            .mockResolvedValueOnce({ sid: 'sid-1' })
            .mockResolvedValueOnce({ sid: 'sid-2' });
        const matrixClient = {
            registerRequest,
            requestRegisterEmailToken,
            generateClientSecret: () => 'client-secret',
            getIdentityServerUrl: () => null,
        };
        mocks.createClient.mockReturnValue(matrixClient as never);
        const onEmailSent = vi.fn();
        const onBusyChange = vi.fn();

        const session = registration.startEmailRegistration(
            { username: 'alice', email: 'alice@example.com', password: 'password' },
            { onEmailSent, onBusyChange },
        );
        let settled = false;
        void session.completion.then(() => { settled = true; });

        await vi.waitFor(() => expect(onEmailSent).toHaveBeenCalledTimes(1));
        expect(mocks.createClient).toHaveBeenCalledWith({
            baseUrl: 'https://matrix.capsachat.org',
        });
        expect(requestRegisterEmailToken).toHaveBeenNthCalledWith(
            1,
            'alice@example.com',
            'client-secret',
            1,
        );
        expect(settled).toBe(false);

        await session.resendEmail();
        expect(requestRegisterEmailToken).toHaveBeenNthCalledWith(
            2,
            'alice@example.com',
            'client-secret',
            2,
        );
        expect(onEmailSent).toHaveBeenCalledTimes(2);

        await session.poll();
        await expect(session.completion).resolves.toEqual(success);
        expect(registerRequest).toHaveBeenCalledTimes(2);
        expect(registerRequest.mock.calls[1][0]).toMatchObject({
            username: 'alice',
            password: 'password',
            initial_device_display_name: 'Capsa Web',
            auth: {
                type: sdk.AuthType.Email,
                session: 'uia-session',
                threepid_creds: {
                    sid: 'sid-2',
                    client_secret: 'client-secret',
                },
            },
        });
    });

    it('отклоняет flow с дополнительной неподдерживаемой стадией до отправки письма', async () => {
        const { sdk, registration } = await loadModules();
        const registerRequest = vi.fn().mockRejectedValue(new sdk.MatrixError({
            errcode: 'M_UNAUTHORIZED',
            error: 'Additional authentication required',
            session: 'uia-session',
            flows: [{ stages: [sdk.AuthType.Email, sdk.AuthType.Recaptcha] }],
        }, 401));
        const requestRegisterEmailToken = vi.fn();
        mocks.createClient.mockReturnValue({
            registerRequest,
            requestRegisterEmailToken,
            generateClientSecret: () => 'client-secret',
            getIdentityServerUrl: () => null,
        } as never);

        const session = registration.startEmailRegistration(
            { username: 'alice', email: 'alice@example.com', password: 'password' },
            { onEmailSent: vi.fn(), onBusyChange: vi.fn() },
        );

        await expect(session.completion).rejects.toBeInstanceOf(sdk.NoAuthFlowFoundError);
        expect(requestRegisterEmailToken).not.toHaveBeenCalled();
    });
});

describe('registrationErrorMessage', () => {
    it.each([
        [{ errcode: 'M_USER_IN_USE' }, 'Этот логин уже занят.'],
        [{ errcode: 'M_THREEPID_IN_USE' }, 'Этот email уже используется.'],
        [{ errcode: 'M_RATE_LIMITED' }, 'Слишком много попыток. Попробуйте позже.'],
        [{ errcode: 'M_FORBIDDEN' }, 'Регистрация сейчас недоступна.'],
        [{ errcode: 'M_INVALID_USERNAME' }, 'Недопустимый логин.'],
        [new TypeError('fetch failed'), 'Не удалось связаться с сервером. Проверьте соединение.'],
    ])('безопасно классифицирует %j', async (error, expected) => {
        const { registration } = await loadModules();
        expect(registration.registrationErrorMessage(error)).toBe(expected);
    });

    it('распознаёт настоящий Matrix rate limit без вывода текста сервера', async () => {
        const { sdk, registration } = await loadModules();
        const error = new sdk.MatrixError({
            errcode: 'M_LIMIT_EXCEEDED',
            error: 'secret server response',
        }, 429);

        expect(registration.registrationErrorMessage(error)).toBe(
            'Слишком много попыток. Попробуйте позже.',
        );
    });

    it('распознаёт SDK ConnectionError', async () => {
        const { sdk, registration } = await loadModules();
        const error = new sdk.ConnectionError('fetch failed', new TypeError('secret cause'));

        expect(registration.registrationErrorMessage(error)).toBe(
            'Не удалось связаться с сервером. Проверьте соединение.',
        );
    });

    it('не показывает raw текст неизвестной ошибки', async () => {
        const { registration } = await loadModules();
        const message = registration.registrationErrorMessage(new Error('password=super-secret'));

        expect(message).toBe('Не удалось зарегистрироваться. Попробуйте ещё раз.');
        expect(message).not.toContain('super-secret');
    });

    it('сообщает об unsupported UIA flow', async () => {
        const { sdk, registration } = await loadModules();
        const error = new sdk.NoAuthFlowFoundError('No flow', [], []);

        expect(registration.registrationErrorMessage(error)).toBe(
            'Сервер не поддерживает регистрацию с подтверждением email.',
        );
    });

    it('не включает пароль или token в известные ошибки', async () => {
        const { registration } = await loadModules();
        const message = registration.registrationErrorMessage({
            errcode: 'M_USER_IN_USE',
            error: 'password=super-secret token=token-value',
        });

        expect(message).not.toContain('super-secret');
        expect(message).not.toContain('token-value');
    });
});
