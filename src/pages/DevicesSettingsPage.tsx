import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, RefreshCw, Smartphone } from 'lucide-react';
import type { IMyDevice } from 'matrix-js-sdk/lib/client';
import { getClient } from '../shared/lib/matrix';
import styles from './SettingsPages.module.css';

const formatLastSeen = (timestamp?: number): string | null => {
    if (!timestamp) return null;
    return new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(timestamp);
};

const DevicesSettingsPage = () => {
    const [devices, setDevices] = useState<IMyDevice[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [nameDraft, setNameDraft] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);

    const loadDevices = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const client = getClient();
            const currentId = client.getDeviceId();
            const result = await client.getDevices();
            setDevices([...result.devices].sort((a, b) => {
                if (a.device_id === currentId) return -1;
                if (b.device_id === currentId) return 1;
                return (b.last_seen_ts ?? 0) - (a.last_seen_ts ?? 0);
            }));
        } catch (loadError) {
            console.error('Failed to load Matrix devices', loadError);
            setError('Не удалось загрузить устройства. Проверьте соединение и попробуйте снова.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void Promise.resolve().then(loadDevices);
    }, [loadDevices]);

    const startRename = (device: IMyDevice) => {
        setEditingId(device.device_id);
        setNameDraft(device.display_name ?? '');
        setError(null);
    };

    const saveName = async () => {
        if (!editingId || !nameDraft.trim() || savingId) return;
        setSavingId(editingId);
        setError(null);
        try {
            await getClient().setDeviceDetails(editingId, {
                display_name: nameDraft.trim(),
            });
            setEditingId(null);
            await loadDevices();
        } catch (saveError) {
            console.error('Failed to rename Matrix device', saveError);
            setError('Не удалось переименовать устройство.');
        } finally {
            setSavingId(null);
        }
    };

    const currentId = getClient().getDeviceId();

    return (
        <div className={styles.wrapper}>
            <div className={styles.column}>
                <header className={styles.pageHeader}>
                    <div>
                        <h1 className={styles.title}>Устройства</h1>
                        <p className={styles.description}>
                            Сессии, которым доступен ваш Matrix-аккаунт.
                        </p>
                    </div>
                    <button
                        className={styles.iconButton}
                        type="button"
                        onClick={() => void loadDevices()}
                        disabled={isLoading}
                        aria-label="Обновить"
                        title="Обновить"
                    >
                        <RefreshCw className={isLoading ? styles.spinner : ''} size={18} />
                    </button>
                </header>

                {error && <p className={styles.error} role="alert">{error}</p>}

                {isLoading && devices.length === 0 ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinner} size={22} />
                        <span>Загрузка устройств…</span>
                    </div>
                ) : (
                    <ul className={styles.cardList}>
                        {devices.map((device) => {
                            const lastSeen = formatLastSeen(device.last_seen_ts);
                            const isCurrent = device.device_id === currentId;
                            return (
                                <li className={styles.deviceRow} key={device.device_id}>
                                    <span className={styles.deviceIcon}>
                                        <Smartphone size={21} />
                                    </span>
                                    <div className={styles.deviceInfo}>
                                        <div className={styles.deviceTitleLine}>
                                            <span className={styles.deviceName}>
                                                {device.display_name || 'Без названия'}
                                            </span>
                                            {isCurrent && (
                                                <span className={styles.badge}>Это устройство</span>
                                            )}
                                        </div>
                                        <span className={styles.deviceId}>{device.device_id}</span>
                                        <span className={styles.deviceMeta}>
                                            {lastSeen ? `Активность: ${lastSeen}` : 'Время активности неизвестно'}
                                            {device.last_seen_ip ? ` · IP: ${device.last_seen_ip}` : ''}
                                        </span>
                                        {editingId === device.device_id && (
                                            <div className={styles.renameForm}>
                                                <input
                                                    className={styles.input}
                                                    value={nameDraft}
                                                    onChange={(event) => setNameDraft(event.target.value)}
                                                    aria-label="Название устройства"
                                                    maxLength={100}
                                                    autoFocus
                                                />
                                                <button
                                                    className={styles.primaryButton}
                                                    type="button"
                                                    onClick={() => void saveName()}
                                                    disabled={!nameDraft.trim() || savingId === device.device_id}
                                                >
                                                    {savingId === device.device_id ? 'Сохранение…' : 'Сохранить'}
                                                </button>
                                                <button
                                                    className={styles.secondaryButton}
                                                    type="button"
                                                    onClick={() => setEditingId(null)}
                                                >
                                                    Отмена
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className={styles.iconButton}
                                        type="button"
                                        onClick={() => startRename(device)}
                                        aria-label="Переименовать"
                                        title="Переименовать"
                                    >
                                        <Pencil size={16} />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default DevicesSettingsPage;
