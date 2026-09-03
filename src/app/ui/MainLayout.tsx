import styles from './MainLayout.module.css';
import { Outlet } from 'react-router-dom';

const MainLayout = () => {
    return (
        <div className={styles.wrapper}>
            <Outlet />
        </div>
    )
}

export default MainLayout;