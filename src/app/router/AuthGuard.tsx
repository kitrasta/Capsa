import { Navigate, Outlet } from 'react-router-dom';
import { useSyncExternalStore } from 'react';
import { getSession } from '../../shared/lib/matrix/session';
import { matrixLifecycle } from '../../shared/lib/matrix/client';

// Единственное место, где UI реагирует на lifecycle Matrix-клиента.
// При M_UNKNOWN_TOKEN менеджер сам останавливает клиент, чистит session keys
// и локальный state → здесь остаётся только увести на Login и передать
// понятное сообщение. Никакой компонент не обрабатывает это отдельно.
const AuthGuard = () => {
    const snapshot = useSyncExternalStore(matrixLifecycle.subscribe, matrixLifecycle.getState);

    // сессия отозвана сервером → Login с сообщением (например, «Сессия истекла, войдите снова»)
    if (snapshot.state === 'session expired') {
        return <Navigate to="/auth" replace state={{ message: snapshot.error }} />;
    }

    if (!getSession()) {
        return <Navigate to="/auth" replace />;
    }

    return <Outlet />;
};

export default AuthGuard;
