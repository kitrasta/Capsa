import styles from './MainLayout.module.css';
import { matchPath, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../../widgets/Sidebar/Sidebar';
import SpaceSidebar from '../../widgets/SpaceWorkspace/SpaceSidebar';
import { SpaceWorkspaceProvider } from '../../widgets/SpaceWorkspace/SpaceWorkspaceContext';
import SettingsMenu from '../../widgets/Settings/SettingsMenu';
import EncryptionRecoveryGate from '../../widgets/EncryptionRecovery/EncryptionRecovery';
import ConnectionStatus from './ConnectionStatus';
import OtkConflictBanner from './OtkConflictBanner';
import LazyRouteErrorBoundary from '../../shared/ui/LazyRouteErrorBoundary/LazyRouteErrorBoundary';
import { useEffect, useSyncExternalStore, Suspense } from 'react';
import {
    getClient,
    getSession,
    matrixLifecycle,
    cleanupLegacyCryptoStore,
} from '../../shared/lib/matrix';
import { subscribeToMessageNotifications } from '../../shared/lib/notifications';

const MainLayout = () => {
    const snapshot = useSyncExternalStore(
        matrixLifecycle.subscribe,
        matrixLifecycle.getState,
    );
    const { pathname } = useLocation();
    const spaceMatch = matchPath('/spaces/:spaceId/*', pathname);
    const spaceRoomMatch = matchPath('/spaces/:spaceId/chats/:roomId', pathname);
    const spaceId = spaceMatch?.params.spaceId
        ? decodeURIComponent(spaceMatch.params.spaceId)
        : undefined;
    const isSettings = pathname.startsWith('/settings');
    const isRoomOpen = Boolean(spaceRoomMatch)
        || (pathname.startsWith('/chats/') && pathname !== '/chats/');
    const layoutClassName = [
        styles.wrapper,
        isRoomOpen ? styles.roomOpen : '',
        spaceId && !spaceRoomMatch ? styles.spaceOverview : '',
        isSettings ? styles.settings : '',
    ].filter(Boolean).join(' ');

    useEffect(() => {
        const session = getSession();
        if (!session) return;
        // разовая подчистка сироты от старого нейминга крипто-базы + запуск клиента
        void cleanupLegacyCryptoStore().then(() => matrixLifecycle.start(session));
    }, [])

    useEffect(() => {
        if (snapshot.state !== 'client ready') return;
        return subscribeToMessageNotifications(getClient());
    }, [snapshot.state]);

    if (snapshot.state === 'client ready') {
        const layout = (
            <div className={layoutClassName}>
                <aside className={styles.sidebar}>
                    {spaceId
                        ? <SpaceSidebar />
                        : isSettings
                          ? <SettingsMenu />
                          : <Sidebar />}
                </aside>
                <main className={styles.content}>
                    <ConnectionStatus />
                    <OtkConflictBanner />
                    {/* lazy-страницы: fallback только внутри контентной области,
                        Sidebar и ConnectionStatus при навигации не мигуют.
                        Error boundary ловит rejected lazy-import (новый деплой /
                        сетевой сбой) и предлагает перезагрузку вместо падения всего app */}
                    <LazyRouteErrorBoundary>
                        <Suspense fallback={<p>Загрузка…</p>}>
                            <Outlet />
                        </Suspense>
                    </LazyRouteErrorBoundary>
                </main>
                <EncryptionRecoveryGate />
            </div>
        );

        return spaceId
            ? (
                <SpaceWorkspaceProvider key={spaceId} spaceId={spaceId}>
                    {layout}
                </SpaceWorkspaceProvider>
            )
            : layout;
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
            {/* Защищённые страницы нельзя монтировать до готовности клиента:
                на прямой ссылке они вызовут getClient() до initClient(). */}
            <main className={styles.content} />
        </div>
    )
}

export default MainLayout;