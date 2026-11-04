import {
    AuthType,
    ConnectionError,
    HTTPError,
    InteractiveAuth,
    MatrixError,
    NoAuthFlowFoundError,
    createClient,
} from 'matrix-js-sdk';
import type { RegisterResponse } from 'matrix-js-sdk';
import { requireHomeserverUrl } from './config';
import { ConfigError } from './error-types';


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
        doRequest: async (auth) => {
            try {
                return await matrixClient.registerRequest({
                    username: input.username,
                    password: input.password,
                    initial_device_display_name: 'Capsa Web',
                    ...(auth ? { auth } : {}),
                });
            } catch (error) {
                if (error instanceof MatrixError && error.httpStatus === 401) {
                    const flows = error.data.flows;
                    const hasEmailOnlyFlow = Array.isArray(flows) && flows.some(
                        (flow) => Array.isArray(flow.stages) &&
                            flow.stages.length === 1 &&
                            flow.stages[0] === AuthType.Email,
                    );
                    if (Array.isArray(flows) && !hasEmailOnlyFlow) {
                        throw new NoAuthFlowFoundError(
                            'Registration requires an unsupported UIA stage',
                            [AuthType.Email],
                            flows,
                        );
                    }
                }
                throw error;
            }
        },
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
    if (
        hasErrcode(error, 'M_RATE_LIMITED') ||
        (error instanceof HTTPError && error.isRateLimitError())
    ) {
        return 'Слишком много попыток. Попробуйте позже.';
    }
    if (hasErrcode(error, 'M_FORBIDDEN')) return 'Регистрация сейчас недоступна.';
    if (hasErrcode(error, 'M_INVALID_USERNAME')) return 'Недопустимый логин.';
    if (error instanceof NoAuthFlowFoundError) {
        return 'Сервер не поддерживает регистрацию с подтверждением email.';
    }
    if (error instanceof ConnectionError || error instanceof TypeError) {
        return 'Не удалось связаться с сервером. Проверьте соединение.';
    }
    return 'Не удалось зарегистрироваться. Попробуйте ещё раз.';
};
