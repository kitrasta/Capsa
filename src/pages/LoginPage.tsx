import style from './LoginPage.module.css';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser, validateLoginResponse } from '../shared/lib/matrix/client';
import { saveSession, getSession, clearSession } from '../shared/lib/matrix/session';

const LoginPage = () => {
    const savedSession = getSession();
    const navigate = useNavigate();

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
            setError('Не удалось войти. Проверьте логин и пароль.');
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
                    {error && <p className={style.error}>{error}</p>}
                </form>

            </div>
        </div>
    )
}


export default LoginPage;