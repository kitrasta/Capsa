import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getClient, joinRoom } from '../../../shared/lib/matrix/client';
import styles from './UnjoinedRoomItem.module.css';

interface Props {
    roomId: string;
    name: string | null;
    avatarUrl: string | null;
}

const AVATAR_SIZE = 40;

// имя-плейсхолдер до загрузки summary: короткая форма roomId до ':'
const placeholderName = (roomId: string): string => roomId.split(':')[0];

// аватар из summary (mxc) — скачиваем с авторизацией (MSC3912)
const useAvatarObjectUrl = (mxcUrl: string | null): string | null => {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!mxcUrl) return;

        let revoked: string | null = null;
        let cancelled = false;

        const load = async () => {
            const client = getClient();
            const httpUrl = client.mxcUrlToHttp(
                mxcUrl,
                AVATAR_SIZE,
                AVATAR_SIZE,
                'crop',
                false,
                false,
                true,
            );
            if (!httpUrl) return;

            try {
                const response = await fetch(httpUrl, {
                    headers: {
                        Authorization: `Bearer ${client.getAccessToken()}`,
                    },
                });
                if (!response.ok) return;

                const blob = await response.blob();
                if (cancelled) return;

                const url = URL.createObjectURL(blob);
                revoked = url;
                setObjectUrl(url);
            } catch (error) {
                console.error('Failed to load avatar:', error);
            }
        };

        load();

        return () => {
            cancelled = true;
            if (revoked) {
                URL.revokeObjectURL(revoked);
            }
        };
    }, [mxcUrl]);

    return objectUrl;
};

// ребёнок пространства, в который мы ещё не вступили
const UnjoinedRoomItem = ({ roomId, name, avatarUrl }: Props) => {
    const navigate = useNavigate();
    const [isJoining, setIsJoining] = useState(false);
    const fetchedAvatarUrl = useAvatarObjectUrl(avatarUrl);

    const displayName = name ?? placeholderName(roomId);

    const handleClick = async () => {
        if (isJoining) return;

        setIsJoining(true);
        try {
            await joinRoom(roomId);
            navigate('/chats/' + encodeURIComponent(roomId));
        } catch (error) {
            // строка сама вернётся в исходное состояние
            console.error('Failed to join room:', error);
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <div className={styles.room} onClick={handleClick}>
            {fetchedAvatarUrl && avatarUrl ? (
                <img
                    className={styles.avatar}
                    src={fetchedAvatarUrl}
                    alt={displayName}
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                />
            ) : (
                <div
                    className={`${styles.avatar} ${styles.avatarFallback}`}
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                >
                    {displayName.charAt(0).toUpperCase()}
                </div>
            )}

            <div className={styles.name}>
                {isJoining ? (
                    <Loader2 className={styles.spinner} size={18} />
                ) : (
                    displayName
                )}
            </div>
        </div>
    );
};

export default UnjoinedRoomItem;
