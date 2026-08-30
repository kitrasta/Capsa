import style from './LoginPage.module.css';

const LoginPage = () => {
    return (
        <div className={style.wrapper}>
            <div className={style.container}>
            <h2 className={style.title}>Capsa</h2>

                <form className={style.form}>
                    
                    <input className={style.input}
                        type="text"
                        id='login'
                        placeholder='send your login' />
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