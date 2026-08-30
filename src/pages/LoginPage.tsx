import style from './LoginPage.module.css';

const LoginPage = () => {
    return (
        <div className={style.wrapper}>
            <div className={style.container}>
            <h2 className={style.title}>Capsa</h2>

                <form className={style.form}>
                        <label htmlFor='login'>Login</label>
                    <input className={style.input}
                        type="text"
                        id='login'
                        placeholder='send your login' />

                        <label htmlFor='password'>Password</label>
                    <input className={style.input}
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