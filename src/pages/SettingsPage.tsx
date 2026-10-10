import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { getClient, logout } from '../shared/lib/matrix/client';
import styles from './SettingsPage.module.css';

const AVATAR_SIZE = 72;

const SettingsPage = () => {
    const navigate = useNavigate();

    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const client = getClient();
        const userId = client.getUserId();
        if (!userId) return;

        const load = async () => {
            try {
                const profile = await client.getProfileInfo(userId);
                setDisplayName(profile.displayname ?? userId);
                if (profile.avatar_url) {
                    const httpUrl = client.mxcUrlToHttp(
                        profile.avatar_url,
                        AVATAR_SIZE,
                        AVATAR_SIZE,
                        'crop',
                    );
                    setAvatarUrl(httpUrl);
                }
            } catch (error) {
                console.error('Failed to load profile:', error);
                setDisplayName(userId);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleLogout = async () => {
        try {
            await logout();
        } catch {
            // ошибку не показываем — юзер уже вышел локально
        }
        navigate('/auth');
    };

    const userId = getClient().getUserId() ?? '';

    return (
        <div className={styles.wrapper}>
            <h1 className={styles.title}>Настройки</h1>

            <section className={styles.card}>
                {isLoading ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinner} size={24} />
                    </div>
                ) : (
                    <div className={styles.profileRow}>
                        {avatarUrl ? (
                            <img
                                className={styles.avatar}
                                src={avatarUrl}
                                alt={displayName}
                                width={AVATAR_SIZE}
                                height={AVATAR_SIZE}
                            />
                        ) : (
                            <div
                                className={`${styles.avatar} ${styles.avatarFallback}`}
                                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                            >
                                {(displayName || '?').charAt(0).toUpperCase()}
                            </div>
                        )}

                        <div className={styles.info}>
                            <div className={styles.name}>{displayName}</div>
                            <div className={styles.userId}>{userId}</div>
                        </div>
                    </div>
                )}

                <button className={styles.logoutButton} onClick={handleLogout}>
                    Выйти
                </button>
            </section>
        </div>
    );
};

export default SettingsPage;
