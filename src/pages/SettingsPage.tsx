import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import {
    getClient,
    logout,
    setDisplayName as saveDisplayName,
    setAvatar,
} from '../shared/lib/matrix/client';
import styles from './SettingsPage.module.css';

const AVATAR_SIZE = 72;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 МБ

const SettingsPage = () => {
    const navigate = useNavigate();

    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // режим редактирования профиля
    const [isEditing, setIsEditing] = useState(false);
    const [nameDraft, setNameDraft] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
    const [nameError, setNameError] = useState<string | null>(null);
    const [avatarError, setAvatarError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // общий путь загрузки профиля: useEffect + обновление после смены аватара
    const loadProfile = useCallback(async () => {
        const client = getClient();
        const userId = client.getUserId();
        if (!userId) return;

        try {
            const profile = await client.getProfileInfo(userId);
            setDisplayName(profile.displayname ?? userId);
            setNameDraft(profile.displayname ?? '');
            setAvatarUrl(
                profile.avatar_url
                    ? client.mxcUrlToHttp(
                          profile.avatar_url,
                          AVATAR_SIZE,
                          AVATAR_SIZE,
                          'crop',
                      )
                    : null,
            );
        } catch (error) {
            console.error('Failed to load profile:', error);
            setDisplayName(userId);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // async-вызов вне синхронного тела эффекта
        void Promise.resolve().then(loadProfile);
    }, [loadProfile]);

    const handleSaveName = async () => {
        const value = nameDraft.trim();
        if (!value || isSavingName) return;

        setIsSavingName(true);
        setNameError(null);
        try {
            await saveDisplayName(value);
            setDisplayName(value);
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to save display name:', error);
            setNameError('Не удалось сохранить имя');
        } finally {
            setIsSavingName(false);
        }
    };

    const handleCancelEdit = () => {
        setNameDraft(displayName);
        setNameError(null);
        setIsEditing(false);
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // чтобы повторный выбор того же файла сработал
        if (!file || isUploadingAvatar) return;

        setAvatarError(null);
        if (file.size > MAX_AVATAR_SIZE) {
            setAvatarError('Файл больше 5 МБ');
            return;
        }

        setIsUploadingAvatar(true);
        try {
            await setAvatar(file);
            // берём свежий mxc через профиль — его вернул сервер
            await loadProfile();
        } catch (error) {
            console.error('Failed to upload avatar:', error);
            setAvatarError('Не удалось загрузить аватар');
        } finally {
            setIsUploadingAvatar(false);
        }
    };

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
                        {isEditing ? (
                            <button
                                className={styles.avatarButton}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingAvatar}
                                aria-label="Сменить аватар"
                            >
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
                                        style={{
                                            width: AVATAR_SIZE,
                                            height: AVATAR_SIZE,
                                        }}
                                    >
                                        {(displayName || '?').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                {isUploadingAvatar && (
                                    <span className={styles.avatarOverlay}>
                                        <Loader2
                                            className={styles.spinner}
                                            size={20}
                                        />
                                    </span>
                                )}
                            </button>
                        ) : avatarUrl ? (
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
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={handleAvatarChange}
                        />

                        <div className={styles.info}>
                            {isEditing ? (
                                <input
                                    className={styles.input}
                                    value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    placeholder="Как вас видят другие"
                                    autoFocus
                                />
                            ) : (
                                <>
                                    <div className={styles.name}>{displayName}</div>
                                    <div className={styles.userId}>{userId}</div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {nameError && <p className={styles.error}>{nameError}</p>}
                {avatarError && <p className={styles.error}>{avatarError}</p>}

                {isEditing ? (
                    <div className={styles.actions}>
                        <button
                            className={styles.saveButton}
                            onClick={handleSaveName}
                            disabled={
                                isSavingName ||
                                !nameDraft.trim() ||
                                nameDraft.trim() === displayName
                            }
                        >
                            {isSavingName ? 'Сохранение…' : 'Сохранить'}
                        </button>
                        <button
                            className={styles.logoutButton}
                            onClick={handleCancelEdit}
                        >
                            Отмена
                        </button>
                    </div>
                ) : (
                    <div className={styles.actions}>
                        <button
                            className={styles.logoutButton}
                            onClick={() => setIsEditing(true)}
                            disabled={isLoading}
                        >
                            Изменить профиль
                        </button>
                        <button
                            className={styles.logoutButton}
                            onClick={handleLogout}
                        >
                            Выйти
                        </button>
                    </div>
                )}
            </section>
        </div>
    );
};

export default SettingsPage;
