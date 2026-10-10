import styles from './MainLayout.module.css';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../../widgets/Sidebar/Sidebar';
import SettingsMenu from '../../widgets/Settings/SettingsMenu';
import { useEffect, useState } from 'react';
import { getSession } from '../../shared/lib/matrix/session';
import { initClient, startClient } from '../../shared/lib/matrix/client'

const MainLayout = () => {

    const [isMatrixReady, setIsMatrixReady] = useState(false)
    const { pathname } = useLocation();
    const isSettings = pathname.startsWith('/settings');


    useEffect(() => {
        const session = getSession();
        if (!session) {
            return;
        };
        const startMatrix = async () => {
            try {
                await initClient(session);
                await startClient();
                setIsMatrixReady(true)
            } catch (error) {
                console.error('Failed to start Matrix client', error)
            }
};
        startMatrix();
    }, [])
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}>
                {isMatrixReady
                    ? (isSettings ? <SettingsMenu /> : <Sidebar />)
                    : <p>Загрузка Matrix...</p>}
            </aside>
            <main className={styles.content}><Outlet /></main>

        </div>
    )
}

export default MainLayout;