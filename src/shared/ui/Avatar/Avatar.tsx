import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Room } from 'matrix-js-sdk';
import { RoomStateEvent } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import styles from './Avatar.module.css';

interface Props {
    room: Room;
    size: number;
}

// аватар комнаты — это state-событие m.room.avatar:
// подписываемся на смены state и читаем mxc реактивно
const useMxcAvatarUrl = (room: Room): string | null =>
    useSyncExternalStore(
        (onChange) => {
            room.currentState.on(RoomStateEvent.Events, onChange);
            return () => {
                room.currentState.off(RoomStateEvent.Events, onChange);
            };
        },
        () => room.getMxcAvatarUrl(),
        () => null,
    );

// скачиваем картинку с авторизацией (MSC3912):
// в <img> напрямую заголовок Authorization не передать
const useAvatarObjectUrl = (mxcUrl: string | null, size: number): string | null => {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!mxcUrl) return;

        let revoked: string | null = null;
        let cancelled = false;

        const load = async () => {
            const client = getClient();
            const httpUrl = client.mxcUrlToHttp(
                mxcUrl,
                size,
                size,
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
                console.error('Failed to load room avatar:', error);
            }
        };

        load();

        return () => {
            cancelled = true;
            if (revoked) {
                URL.revokeObjectURL(revoked);
            }
        };
    }, [mxcUrl, size]);

    return objectUrl;
};

const Avatar = ({ room, size }: Props) => {
    const mxcUrl = useMxcAvatarUrl(room);
    const avatarUrl = useAvatarObjectUrl(mxcUrl, size);

    if (mxcUrl && avatarUrl) {
        return (
            <img
                className={styles.avatar}
                src={avatarUrl}
                alt={room.name}
                width={size}
                height={size}
            />
        );
    }

    return (
        <div
            className={`${styles.avatar} ${styles.avatarFallback}`}
            style={{ width: size, height: size }}
        >
            {(room.name || '?').charAt(0).toUpperCase()}
        </div>
    );
};

export default Avatar;
