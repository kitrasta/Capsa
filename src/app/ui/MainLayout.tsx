import styles from './MainLayout.module.css';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../../widgets/Sidebar/Sidebar';
import SettingsMenu from '../../widgets/Settings/SettingsMenu';
import { useEffect, useSyncExternalStore } from 'react';
import { getSession } from '../../shared/lib/matrix/session';
import { matrixLifecycle, cleanupLegacyCryptoStore } from '../../shared/lib/matrix/client'

const MainLayout = () => {
    const snapshot = useSyncExternalStore(
        matrixLifecycle.subscribe,
        matrixLifecycle.getState,
    );
    const { pathname } = useLocation();
    const isSettings = pathname.startsWith('/settings');

    useEffect(() => {
        const session = getSession();
        if (!session) return;
        // разовая подчистка сироты от старого нейминга крипто-базы + запуск клиента
        void cleanupLegacyCryptoStore().then(() => matrixLifecycle.start(session));
    }, [])

    if (snapshot.state === 'client ready') {
        return (
            <div className={styles.wrapper}>
                <aside className={styles.sidebar}>
                    {isSettings ? <SettingsMenu /> : <Sidebar />}
                </aside>
                <main className={styles.content}><Outlet /></main>
            </div>
        )
    }

    // client starting | idle → лоадер; любое другое состояние = ошибка с причиной
    const fallback = snapshot.state === 'client starting' || snapshot.state === 'idle'
        ? 'Загрузка Matrix...'
        : 'Не удалось подключить Matrix';
    return (
        <div className={styles.wrapper}>
            <aside className={styles.sidebar}>
                {snapshot.state === 'client starting' || snapshot.state === 'idle'
                    ? <p>{fallback}</p>
                    : <p className={styles.startupError}>{snapshot.error ?? fallback}</p>}
            </aside>
            <main className={styles.content}><Outlet /></main>
        </div>
    )
}

export default MainLayout;