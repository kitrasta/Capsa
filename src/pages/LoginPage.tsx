import style from './LoginPage.module.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUser } from '../shared/lib/matrix/client';
import { saveSession } from '../shared/lib/matrix/session';

const LoginPage = () => {

    const navigate = useNavigate();

    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('')

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try {
            const result = await loginUser(login, password);

                saveSession({
                    accessToken: result.access_token,
                    userId: result.user_id,
                    deviceId: result.device_id
                });
                    
                navigate('/main');
            


            console.log(result);
        }   catch (error) {
            console.error('Login failed', error)
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
                    <button className={style.login} type="submit">Войти</button>
                </form>

            </div>
        </div>
    )
}


export default LoginPage;