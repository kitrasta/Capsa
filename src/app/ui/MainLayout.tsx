import styles from './MainLayout.module.css';
import { Outlet } from 'react-router-dom';

const MainLayout = () => {
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}>Список чатов</aside>
            <main className={styles.content}><Outlet /></main>
            
        </div>
    )
}

export default MainLayout;