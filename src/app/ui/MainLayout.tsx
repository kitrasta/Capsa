import styles from './MainLayout.module.css';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../widgets/Sidebar/Sidebar';
import { useEffect } from 'react';
import { getSession } from '../../shared/lib/matrix/session';
import { initClient, startClient } from '../../shared/lib/matrix/client'

const MainLayout = () => {


    useEffect(() => {
        const session = getSession();
        if (!session) {
            return;
        };
        const startMatrix = async () => {
            try {
                await initClient(session);
                await startClient();
            } catch (error) {
                console.error('Failed to start Matrix client', error)
            }
};
        startMatrix();
    }, [])
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}><Sidebar /></aside>
            <main className={styles.content}><Outlet /></main>

        </div>
    )
}

export default MainLayout;