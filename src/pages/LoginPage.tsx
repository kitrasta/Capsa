import style from './LoginPage.module.css';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    loginUser,
    validateLoginResponse,
    saveSession,
    getSession,
    clearSession,
    ConfigError,
    isForbiddenError,
    matrixErrorMessage,
} from '../shared/lib/matrix';

// честные сообщения об ошибках входа: ошибку конфигурации нельзя
// маскировать под «неверный пароль» — юзер пойдёт менять не тот пароль
const loginErrorMessage = (err: unknown): string => {
    if (err instanceof ConfigError) return err.message;
    if (isForbiddenError(err)) return 'Неверный логин или пароль.';
    // сетевые ошибки (TypeError из fetch: нет сети, DNS, CORS) — без errcode
    if (err instanceof TypeError) return 'Не удалось связаться с сервером. Проверьте соединение.';
    return `Не удалось войти: ${matrixErrorMessage(err)}`;
};

const LoginPage = () => {
    const savedSession = getSession();
    const navigate = useNavigate();
    const location = useLocation();
    // понятное сообщение от lifecycle (например, «Сессия истекла, войдите снова»):
    // его передаёт AuthGuard одним местом — здесь только отображаем
    const notice = (location.state as { message?: string } | null)?.message ?? null;

    useEffect(() => {
        if (savedSession) {
            navigate('/chats');
        }
    }, [savedSession, navigate])

    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError(null);
        try {
            const result = await loginUser(login, password);

            // явная валидация полей login-ответа — до saveSession:
            // — access_token / device_id строго непустая строка;
            // — user_id строго по форме @localpart:homeserver;
            // — токен нигде не логируется
            validateLoginResponse(result);

            saveSession({
                accessToken: result.access_token!,
                userId: result.user_id!,
                deviceId: result.device_id!,
            });

            navigate('/chats');
        } catch (err) {
            console.error('Login failed', err);
            // откат: если сессия успела сохраниться частично — стираем,
            // иначе юзер застрянет в битой сессии с редиректом на /chats
            clearSession();
            setError(loginErrorMessage(err));
        } finally {
            setIsSubmitting(false);
        }
    }




    return (
        <div className={style.wrapper}>
            <div className={style.container}>
                <h2 className={style.title}>Capsa</h2>

                <form
                    className={style.form} onSubmit={handleSubmit}>
                    <label htmlFor='login'>Login</label>
                    <input className={style.input}
                        value={login}
                        onChange={(e) => setLogin(e.target.value)}
                        type="text"
                        id='login'
                        placeholder='send your login' />

                    <label htmlFor='password'>Password</label>
                    <input className={style.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        id='password'
                        placeholder="send your password" />
                    <button className={style.login} type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Вход…' : 'Войти'}
                    </button>
                    {notice && !error && <p className={style.notice}>{notice}</p>}
                    {error && <p className={style.error}>{error}</p>}
                </form>

            </div>
        </div>
    )
}


export default LoginPage;