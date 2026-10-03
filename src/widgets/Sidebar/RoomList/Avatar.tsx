import { useEffect, useState } from 'react';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import styles from './Avatar.module.css';

interface Props {
    room: Room;
    size: number;
}

const useAvatarUrl = (room: Room, size: number): string | null => {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let revoked: string | null = null;
        let cancelled = false;

        const load = async () => {
            const client = getClient();
            const mxcUrl = room.getMxcAvatarUrl();
            if (!mxcUrl) return;

            // аутентифицированный эндпоинт медиа (MSC3912):
            // картинку надо запросить с заголовком Authorization,
            // в <img> напрямую она не открывается
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

                const objectUrl = URL.createObjectURL(blob);
                revoked = objectUrl;
                setUrl(objectUrl);
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
    }, [room, size]);

    return url;
};

const Avatar = ({ room, size }: Props) => {
    const avatarUrl = useAvatarUrl(room, size);

    if (avatarUrl) {
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
