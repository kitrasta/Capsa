import styles from './MainLayout.module.css';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../../widgets/Sidebar/Sidebar';
import SettingsMenu from '../../widgets/Settings/SettingsMenu';
import { useEffect, useState } from 'react';
import { getSession } from '../../shared/lib/matrix/session';
import { initClient, startClient, cleanupLegacyCryptoStore } from '../../shared/lib/matrix/client'

const MainLayout = () => {

    const [isMatrixReady, setIsMatrixReady] = useState(false)
    const [startupError, setStartupError] = useState<string | null>(null)
    const { pathname } = useLocation();
    const isSettings = pathname.startsWith('/settings');


    useEffect(() => {
        const session = getSession();
        if (!session) {
            return;
        };
        const startMatrix = async () => {
            try {
                // разовая подчистка сироты от старого нейминга крипто-базы
                await cleanupLegacyCryptoStore();
                await initClient(session);
                await startClient();
                setIsMatrixReady(true)
            } catch (error) {
                console.error('Failed to start Matrix client', error)
                // юзер должен видеть причину, а не вечно вращающуюся загрузку
                setStartupError(
                    error instanceof Error
                        ? error.message
                        : 'Не удалось подключиться к серверу',
                )
            }
};
        startMatrix();
    }, [])
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}>
                {isMatrixReady
                    ? (isSettings ? <SettingsMenu /> : <Sidebar />)
                    : startupError
                      ? <p className={styles.startupError}>{startupError}</p>
                      : <p>Загрузка Matrix...</p>}
            </aside>
            <main className={styles.content}><Outlet /></main>

        </div>
    )
}

export default MainLayout;