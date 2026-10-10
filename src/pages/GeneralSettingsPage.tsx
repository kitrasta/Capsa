import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, User, ChevronRight } from 'lucide-react';
import {
    getClient,
    setDisplayName as saveDisplayName,
    setAvatar,
} from '../shared/lib/matrix/client';
import styles from './GeneralSettingsPage.module.css';

const AVATAR_SIZE = 72;
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 МБ

const GeneralSettingsPage = () => {
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

    const userId = getClient().getUserId() ?? '';

    return (
        <div className={styles.wrapper}>
            <div className={styles.column}>
                <div className={styles.header}>
                    {isLoading ? (
                        <Loader2 className={styles.headerSpinner} size={28} />
                    ) : (
                        <>
                            {avatarUrl ? (
                                <img
                                    className={styles.headerAvatar}
                                    src={avatarUrl}
                                    alt={displayName}
                                />
                            ) : (
                                <div
                                    className={`${styles.headerAvatar} ${styles.headerAvatarFallback}`}
                                >
                                    {(displayName || '?').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className={styles.headerName}>{displayName}</div>
                            <div className={styles.headerUserId}>{userId}</div>
                        </>
                    )}
                </div>

                <div className={styles.divider} />

                <div className={styles.rowGroup}>
                    <button
                        className={styles.row}
                        onClick={() => setIsEditing(true)}
                    >
                        <span className={`${styles.rowIcon} ${styles.rowIconProfile}`}>
                            <User size={18} />
                        </span>
                        <span className={styles.rowLabel}>Профиль</span>
                        <span className={styles.rowSub}>{displayName}</span>
                        <ChevronRight className={styles.rowChevron} size={16} />
                    </button>

                    {isEditing && (
                        <div className={styles.editor}>
                            <button
                                className={styles.editorAvatarButton}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingAvatar}
                                aria-label="Сменить аватар"
                            >
                                {avatarUrl ? (
                                    <img
                                        className={styles.editorAvatar}
                                        src={avatarUrl}
                                        alt={displayName}
                                    />
                                ) : (
                                    <div
                                        className={`${styles.editorAvatar} ${styles.editorAvatarFallback}`}
                                    >
                                        {(displayName || '?').charAt(0).toUpperCase()}
                                    </div>
                                )}
                                {isUploadingAvatar && (
                                    <span className={styles.editorAvatarOverlay}>
                                        <Loader2
                                            className={styles.editorSpinner}
                                            size={20}
                                        />
                                    </span>
                                )}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                hidden
                                onChange={handleAvatarChange}
                            />

                            <input
                                className={styles.editorInput}
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                placeholder="Как вас видят другие"
                                autoFocus
                            />

                            {nameError && (
                                <p className={styles.editorError}>{nameError}</p>
                            )}
                            {avatarError && (
                                <p className={styles.editorError}>{avatarError}</p>
                            )}

                            <div className={styles.editorActions}>
                                <button
                                    className={styles.editorSaveButton}
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
                                    className={styles.editorCancelButton}
                                    onClick={handleCancelEdit}
                                >
                                    Отмена
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GeneralSettingsPage;
