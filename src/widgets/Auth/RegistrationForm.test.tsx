// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RegisterResponse } from 'matrix-js-sdk';
import type { RegistrationEvents, RegistrationSession } from '../../shared/lib/matrix';

const mocks = vi.hoisted(() => ({
    start: vi.fn(),
    errorMessage: vi.fn((error: unknown) => `Безопасная ошибка: ${(error as Error).message}`),
}));

vi.mock('../../shared/lib/matrix', () => ({
    startEmailRegistration: mocks.start,
    registrationErrorMessage: mocks.errorMessage,
}));

import RegistrationForm from './RegistrationForm';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const registrationResult: RegisterResponse = {
    user_id: '@alice:capsachat.org',
    access_token: 'access-token',
    device_id: 'DEVICE1',
};

function mockRegistration() {
    const completion = deferred<RegisterResponse>();
    const session: RegistrationSession = {
        completion: completion.promise,
        poll: vi.fn(async () => {}),
        resendEmail: vi.fn(async () => {}),
    };
    let events: RegistrationEvents | undefined;
    mocks.start.mockImplementation((_input, receivedEvents) => {
        events = receivedEvents;
        return session;
    });
    return { session, completion, events: () => events! };
}

function fillValidForm() {
    fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'password' } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'password' } });
}

function submitForm() {
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('RegistrationForm validation', () => {
    it('не отправляет пустую форму', () => {
        mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);

        submitForm();

        expect(mocks.start).not.toHaveBeenCalled();
        expect(screen.getByText('Заполните все поля.')).toBeTruthy();
    });

    it('проверяет email до обращения к серверу', () => {
        mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);
        fillValidForm();
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid' } });

        submitForm();

        expect(mocks.start).not.toHaveBeenCalled();
        expect(screen.getByText('Введите корректный email.')).toBeTruthy();
    });

    it('не отправляет несовпадающие пароли', () => {
        mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);
        fillValidForm();
        fireEvent.change(screen.getByLabelText('Повторите пароль'), {
            target: { value: 'different' },
        });

        submitForm();

        expect(mocks.start).not.toHaveBeenCalled();
        expect(screen.getByText('Пароли не совпадают.')).toBeTruthy();
    });
});

describe('RegistrationForm email flow', () => {
    it('показывает email-pending только после отправки письма и блокирует повторный submit', async () => {
        const registration = mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);
        fillValidForm();

        const submit = screen.getByRole('button', { name: 'Создать аккаунт' });
        fireEvent.click(submit);
        fireEvent.click(submit);

        expect(mocks.start).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Проверьте почту')).toBeNull();
        await act(async () => registration.events().onEmailSent());
        expect(screen.getByText('Проверьте почту')).toBeTruthy();
        expect(screen.getByText(/alice@example.com/)).toBeTruthy();
    });

    it('poll-ит каждые 2 секунды и даёт resend только после cooldown', async () => {
        vi.useFakeTimers();
        const registration = mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);
        fillValidForm();
        submitForm();
        await act(async () => registration.events().onEmailSent());

        const resend = screen.getByRole('button', { name: /Отправить письмо снова/ });
        expect((resend as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(resend);
        expect(registration.session.resendEmail).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(registration.session.poll).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(28000);
        });
        expect((resend as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(resend);
        fireEvent.click(resend);
        expect(registration.session.resendEmail).toHaveBeenCalledTimes(1);
    });

    it('передаёт успешный ответ регистрации родителю', async () => {
        const registration = mockRegistration();
        const onRegistered = vi.fn();
        render(<RegistrationForm onRegistered={onRegistered} />);
        fillValidForm();
        submitForm();
        await act(async () => registration.events().onEmailSent());

        await act(async () => registration.completion.resolve(registrationResult));

        expect(onRegistered).toHaveBeenCalledWith(registrationResult);
    });

    it('показывает безопасное сообщение об ошибке', async () => {
        const registration = mockRegistration();
        render(<RegistrationForm onRegistered={vi.fn()} />);
        fillValidForm();
        submitForm();
        const error = new Error('секретное тело ответа');

        await act(async () => registration.completion.reject(error));

        expect(mocks.errorMessage).toHaveBeenCalledWith(error);
        expect(screen.getByText('Безопасная ошибка: секретное тело ответа')).toBeTruthy();
    });

    it('после unmount не poll-ит и не обрабатывает поздний completion', async () => {
        vi.useFakeTimers();
        const registration = mockRegistration();
        const onRegistered = vi.fn();
        const view = render(<RegistrationForm onRegistered={onRegistered} />);
        fillValidForm();
        submitForm();
        await act(async () => registration.events().onEmailSent());

        view.unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
            registration.completion.resolve(registrationResult);
            await registration.completion.promise;
        });

        expect(registration.session.poll).not.toHaveBeenCalled();
        expect(onRegistered).not.toHaveBeenCalled();
    });
});
