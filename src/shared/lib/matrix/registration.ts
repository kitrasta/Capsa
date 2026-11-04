import {
    AuthType,
    InteractiveAuth,
    NoAuthFlowFoundError,
    createClient,
} from 'matrix-js-sdk';
import type { RegisterResponse } from 'matrix-js-sdk';
import { requireHomeserverUrl } from './config';
import { ConfigError } from './error-types';
import { matrixErrorMessage } from './errors';

export interface RegistrationInput {
    username: string;
    email: string;
    password: string;
}

export interface RegistrationEvents {
    onEmailSent: () => void;
    onBusyChange: (busy: boolean) => void;
}

export interface RegistrationSession {
    completion: Promise<RegisterResponse>;
    poll: () => Promise<void>;
    resendEmail: () => Promise<void>;
}

export const startEmailRegistration = (
    input: RegistrationInput,
    events: RegistrationEvents,
): RegistrationSession => {
    const matrixClient = createClient({ baseUrl: requireHomeserverUrl() });
    const interactiveAuth = new InteractiveAuth<RegisterResponse>({
        matrixClient,
        inputs: { emailAddress: input.email },
        supportedStages: [AuthType.Email],
        doRequest: (auth) => matrixClient.registerRequest({
            username: input.username,
            password: input.password,
            initial_device_display_name: 'Capsa Web',
            ...(auth ? { auth } : {}),
        }),
        requestEmailToken: async (email, clientSecret, sendAttempt) => {
            const result = await matrixClient.requestRegisterEmailToken(
                email,
                clientSecret,
                sendAttempt,
            );
            events.onEmailSent();
            return result;
        },
        busyChanged: events.onBusyChange,
        stateUpdated: () => {},
    });

    return {
        completion: interactiveAuth.attemptAuth(),
        poll: () => interactiveAuth.poll(),
        resendEmail: () => interactiveAuth.requestEmailToken(),
    };
};

const hasErrcode = (error: unknown, code: string): boolean =>
    error != null &&
    typeof error === 'object' &&
    'errcode' in error &&
    (error as { errcode?: unknown }).errcode === code;

export const registrationErrorMessage = (error: unknown): string => {
    if (error instanceof ConfigError) return error.message;
    if (hasErrcode(error, 'M_USER_IN_USE')) return 'Этот логин уже занят.';
    if (hasErrcode(error, 'M_THREEPID_IN_USE')) return 'Этот email уже используется.';
    if (hasErrcode(error, 'M_RATE_LIMITED')) return 'Слишком много попыток. Попробуйте позже.';
    if (hasErrcode(error, 'M_FORBIDDEN')) return 'Регистрация сейчас недоступна.';
    if (hasErrcode(error, 'M_INVALID_USERNAME')) return 'Недопустимый логин.';
    if (error instanceof NoAuthFlowFoundError) {
        return 'Сервер не поддерживает регистрацию с подтверждением email.';
    }
    if (error instanceof TypeError) return 'Не удалось связаться с сервером. Проверьте соединение.';
    return `Не удалось зарегистрироваться: ${matrixErrorMessage(error)}`;
};
