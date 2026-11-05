import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { otkConflict, matrixLifecycle } from '../../shared/lib/matrix';
import styles from './ConnectionStatus.module.css';

// Конфликт one-time keys: крипто-база была стёрта, а deviceId остался прежним,
// поэтому сервер бесконечно отклоняет /keys/upload (400 «already exists»).
// Лечится только новым устройством — объясняем это и даём кнопку выхода.
// Паттерн баннера и стили — как у ConnectionStatus.
const OtkConflictBanner = () => {
    const { conflict } = useSyncExternalStore(
        otkConflict.subscribe,
        otkConflict.getState,
    );
    const navigate = useNavigate();

    if (!conflict) return null;

    const handleLogout = async () => {
        try {
            await matrixLifecycle.logout();
        } catch {
            // локальный выход уже произошёл — ошибку не показываем
        }
        navigate('/auth');
    };

    return (
        <div className={styles.banner} role="alert">
            Ключи шифрования этого устройства конфликтуют с сервером. Выйдите и
            войдите снова, чтобы создать новое устройство, затем восстановите
            ключи.{' '}
            <button type="button" onClick={handleLogout}>
                Выйти
            </button>
        </div>
    );
};

export default OtkConflictBanner;
