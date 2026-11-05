import { useState } from 'react';
import { Bell } from 'lucide-react';
import {
    getBrowserNotificationPermission,
    getMessageNotificationsEnabled,
    requestBrowserNotificationPermission,
    setMessageNotificationsEnabled,
    showBrowserNotification,
    type BrowserNotificationPermission,
} from '../shared/lib/notifications';
import styles from './SettingsPages.module.css';

const permissionMessage = (permission: BrowserNotificationPermission): string | null => {
    if (permission === 'denied') {
        return 'Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта.';
    }
    if (permission === 'unsupported') {
        return 'Этот браузер не поддерживает уведомления.';
    }
    return null;
};

const NotificationsSettingsPage = () => {
    const [enabled, setEnabled] = useState(getMessageNotificationsEnabled);
    const [permission, setPermission] = useState(getBrowserNotificationPermission);
    const [isRequesting, setIsRequesting] = useState(false);
    const unsupported = permission === 'unsupported';

    const updateEnabled = (value: boolean) => {
        setEnabled(value);
        setMessageNotificationsEnabled(value);
    };

    const handleToggle = async (nextEnabled: boolean) => {
        if (!nextEnabled) {
            updateEnabled(false);
            return;
        }

        setIsRequesting(true);
        const nextPermission = permission === 'granted'
            ? 'granted'
            : await requestBrowserNotificationPermission();
        setPermission(nextPermission);
        updateEnabled(nextPermission === 'granted');
        setIsRequesting(false);
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.column}>
                <header className={styles.pageHeader}>
                    <div>
                        <h1 className={styles.title}>Уведомления</h1>
                        <p className={styles.description}>
                            Браузерные уведомления о новых сообщениях, когда вкладка Capsa скрыта.
                        </p>
                    </div>
                </header>

                <section className={styles.settingsCard}>
                    <label className={styles.toggleRow}>
                        <span className={styles.deviceIcon}><Bell size={20} /></span>
                        <span className={styles.optionText}>
                            <span className={styles.optionTitle}>Уведомления о новых сообщениях</span>
                            <span className={styles.optionDescription}>
                                Только входящие сообщения, без истории при запуске
                            </span>
                        </span>
                        <input
                            type="checkbox"
                            checked={enabled}
                            disabled={unsupported || isRequesting}
                            onChange={(event) => void handleToggle(event.target.checked)}
                        />
                    </label>

                    {permissionMessage(permission) && (
                        <p className={styles.permissionNotice}>{permissionMessage(permission)}</p>
                    )}

                    <button
                        className={styles.secondaryButton}
                        type="button"
                        disabled={!enabled || permission !== 'granted'}
                        onClick={() => showBrowserNotification(
                            'Capsa',
                            'Уведомления Capsa включены и работают.',
                        )}
                    >
                        Проверить уведомление
                    </button>
                </section>
            </div>
        </div>
    );
};

export default NotificationsSettingsPage;
