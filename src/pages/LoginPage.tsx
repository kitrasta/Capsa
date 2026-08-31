import style from './LoginPage.module.css';
import { useState } from 'react';

const LoginPage = () => {

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

    }

    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('')


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
                    <button className={style.login} type="submit">Войти</button>
                </form>

            </div>
        </div>
    )
}


export default LoginPage;