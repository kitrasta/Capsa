import { useEffect, useRef, useState } from 'react';
import type { RegisterResponse } from 'matrix-js-sdk';
import {
    registrationErrorMessage,
    startEmailRegistration,
    type RegistrationSession,
} from '../../shared/lib/matrix';
import styles from './RegistrationForm.module.css';

interface RegistrationFormProps {
    onRegistered: (result: RegisterResponse) => void;
}

const RegistrationForm = ({ onRegistered }: RegistrationFormProps) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailPending, setEmailPending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const sessionRef = useRef<RegistrationSession | null>(null);
    const mountedRef = useRef(true);
    const generationRef = useRef(0);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            generationRef.current += 1;
            sessionRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!emailPending) return;
        const timer = window.setInterval(() => {
            const session = sessionRef.current;
            if (!session || !mountedRef.current) return;
            void session.poll().catch((pollError) => {
                if (mountedRef.current) setError(registrationErrorMessage(pollError));
            });
        }, 2000);
        return () => window.clearInterval(timer);
    }, [emailPending]);

    const isResendCoolingDown = resendCooldown > 0;
    useEffect(() => {
        if (!emailPending || !isResendCoolingDown) return;
        const timer = window.setInterval(() => {
            setResendCooldown((value) => Math.max(0, value - 1));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [emailPending, isResendCoolingDown]);

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy || sessionRef.current) return;

        const normalizedUsername = username.trim();
        const normalizedEmail = email.trim();
        if (!normalizedUsername || !normalizedEmail || !password || !passwordConfirmation) {
            setError('Заполните все поля.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setError('Введите корректный email.');
            return;
        }
        if (password !== passwordConfirmation) {
            setError('Пароли не совпадают.');
            return;
        }

        setError(null);
        setBusy(true);
        const generation = ++generationRef.current;
        const isCurrent = () => mountedRef.current && generationRef.current === generation;

        try {
            const session = startEmailRegistration(
                { username: normalizedUsername, email: normalizedEmail, password },
                {
                    onEmailSent: () => {
                        if (!isCurrent()) return;
                        setEmailPending(true);
                        setResendCooldown(30);
                        setBusy(false);
                    },
                    onBusyChange: (value) => {
                        if (isCurrent()) setBusy(value);
                    },
                },
            );
            sessionRef.current = session;
            void session.completion.then((result) => {
                if (!isCurrent()) return;
                sessionRef.current = null;
                onRegistered(result);
            }).catch((registrationError) => {
                if (!isCurrent()) return;
                sessionRef.current = null;
                setEmailPending(false);
                setError(registrationErrorMessage(registrationError));
            }).finally(() => {
                if (isCurrent()) setBusy(false);
            });
        } catch (registrationError) {
            if (!isCurrent()) return;
            sessionRef.current = null;
            setBusy(false);
            setError(registrationErrorMessage(registrationError));
        }
    };

    const handleResend = async () => {
        const session = sessionRef.current;
        if (!session || busy || resendCooldown > 0) return;
        const generation = generationRef.current;
        const isCurrent = () => mountedRef.current &&
            generationRef.current === generation &&
            sessionRef.current === session;
        setBusy(true);
        setError(null);
        try {
            await session.resendEmail();
        } catch (resendError) {
            if (isCurrent()) setError(registrationErrorMessage(resendError));
        } finally {
            if (isCurrent()) setBusy(false);
        }
    };

    const handleReset = () => {
        generationRef.current += 1;
        sessionRef.current = null;
        setEmailPending(false);
        setBusy(false);
        setError(null);
        setPassword('');
        setPasswordConfirmation('');
        setResendCooldown(0);
    };

    if (emailPending) {
        return (
            <div className={styles.pending}>
                <h3>Проверьте почту</h3>
                <p>
                    Мы отправили ссылку на <strong>{email.trim()}</strong>.
                    Подтвердите email, не закрывая эту вкладку.
                </p>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button
                    className={styles.secondary}
                    type="button"
                    onClick={() => void handleResend()}
                    disabled={busy || resendCooldown > 0}
                >
                    Отправить письмо снова{resendCooldown > 0 ? ` (${resendCooldown})` : ''}
                </button>
                <button className={styles.link} type="button" onClick={handleReset}>
                    Начать заново
                </button>
            </div>
        );
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <label htmlFor="register-username">Логин</label>
            <input
                className={styles.input}
                id="register-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={busy}
            />
            <label htmlFor="register-email">Email</label>
            <input
                className={styles.input}
                id="register-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={busy}
            />
            <label htmlFor="register-password">Пароль</label>
            <input
                className={styles.input}
                id="register-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                disabled={busy}
            />
            <label htmlFor="register-password-confirmation">Повторите пароль</label>
            <input
                className={styles.input}
                id="register-password-confirmation"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
                disabled={busy}
            />
            <button className={styles.submit} type="submit" disabled={busy}>
                {busy ? 'Регистрация…' : 'Создать аккаунт'}
            </button>
            <p className={styles.note}>Аккаунт будет создан на capsachat.org</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
    );
};

export default RegistrationForm;
