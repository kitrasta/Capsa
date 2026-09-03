import styles from './MainLayout.module.css';
import { Outlet } from 'react-router-dom';
import Sidebar  from '../../widgets/Sidebar/Sidebar';

const MainLayout = () => {
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}><Sidebar /></aside>
            <main className={styles.content}><Outlet /></main>
            
        </div>
    )
}

export default MainLayout;