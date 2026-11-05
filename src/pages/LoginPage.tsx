import style from './LoginPage.module.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    loginUser,
    validateLoginResponse,
    saveSession,
    getSession,
    clearSession,
    ConfigError,
    HomeserverDiscoveryError,
    isForbiddenError,
    matrixErrorMessage,
    resolveLoginTarget,
    getCapsaHomeserver,
    type HomeserverConnection,
} from '../shared/lib/matrix';
import RegistrationForm from '../widgets/Auth/RegistrationForm';

interface AuthResponse {
    access_token?: string;
    user_id?: string;
    device_id?: string;
}

// Ошибку конфигурации/discovery нельзя маскировать под неверный пароль.
const loginErrorMessage = (err: unknown): string => {
    if (err instanceof ConfigError || err instanceof HomeserverDiscoveryError) return err.message;
    if (isForbiddenError(err)) return 'Неверный логин или пароль.';
    if (err instanceof TypeError) return 'Не удалось связаться с сервером. Проверьте соединение.';
    return `Не удалось войти: ${matrixErrorMessage(err)}`;
};

const LoginPage = () => {
    const savedSession = getSession();
    const navigate = useNavigate();
    const location = useLocation();
    const notice = (location.state as { message?: string } | null)?.message ?? null;
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loginAttemptRef = useRef(0);

    useEffect(() => {
        if (savedSession) navigate('/chats');
    }, [savedSession, navigate]);

    const completeAuth = (result: AuthResponse, connection: HomeserverConnection) => {
        validateLoginResponse(result);
        saveSession({
            accessToken: result.access_token!,
            userId: result.user_id!,
            deviceId: result.device_id!,
            homeserverUrl: connection.homeserverUrl,
            serverName: connection.serverName,
        });
        navigate('/chats');
    };

    const switchMode = (nextMode: 'login' | 'register') => {
        if (nextMode === mode) return;
        loginAttemptRef.current += 1;
        setMode(nextMode);
        setError(null);
        setIsSubmitting(false);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (isSubmitting) return;

        const attempt = ++loginAttemptRef.current;
        setIsSubmitting(true);
        setError(null);
        try {
            const target = await resolveLoginTarget(login);
            if (attempt !== loginAttemptRef.current) return;
            const result = await loginUser(target, password);
            if (attempt !== loginAttemptRef.current) return;
            completeAuth(result, target);
        } catch (err) {
            if (attempt !== loginAttemptRef.current) return;
            clearSession();
            setError(loginErrorMessage(err));
        } finally {
            if (attempt === loginAttemptRef.current) setIsSubmitting(false);
        }
    };

    return (
        <div className={style.wrapper}>
            <div className={style.container}>
                <h2 className={style.title}>Capsa</h2>
                <div className={style.tabs} role="tablist" aria-label="Авторизация">
                    <button
                        className={mode === 'login' ? style.tabActive : style.tab}
                        type="button"
                        role="tab"
                        id="login-tab"
                        aria-selected={mode === 'login'}
                        aria-controls="auth-panel"
                        onClick={() => switchMode('login')}
                    >
                        Вход
                    </button>
                    <button
                        className={mode === 'register' ? style.tabActive : style.tab}
                        type="button"
                        role="tab"
                        id="register-tab"
                        aria-selected={mode === 'register'}
                        aria-controls="auth-panel"
                        onClick={() => switchMode('register')}
                    >
                        Регистрация
                    </button>
                </div>
                <div
                    className={style.panel}
                    role="tabpanel"
                    id="auth-panel"
                    aria-labelledby={mode === 'login' ? 'login-tab' : 'register-tab'}
                >
                    {mode === 'login' ? (
                        <form className={style.form} onSubmit={handleSubmit}>
                            <label htmlFor="login">Matrix ID или логин</label>
                            <input
                                className={style.input}
                                value={login}
                                onChange={(event) => setLogin(event.target.value)}
                                type="text"
                                id="login"
                                placeholder="@alice:matrix.org"
                                autoComplete="username"
                                disabled={isSubmitting}
                            />
                            <label htmlFor="password">Password</label>
                            <input
                                className={style.input}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                type="password"
                                id="password"
                                placeholder="Ваш пароль"
                                autoComplete="current-password"
                                disabled={isSubmitting}
                            />
                            <button className={style.login} type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Вход…' : 'Войти'}
                            </button>
                            {notice && !error && <p className={style.notice}>{notice}</p>}
                            {error && <p className={style.error} role="alert">{error}</p>}
                        </form>
                    ) : (
                        <RegistrationForm
                            onRegistered={(result) => completeAuth(result, getCapsaHomeserver())}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
