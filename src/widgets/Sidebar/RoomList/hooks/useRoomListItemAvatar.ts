// Аватар комнаты для элемента списка: mxc → object URL.
// Скачивание картинки — отдельный эффект (вынесен из RoomListItem): в <img>
// напрямую заголовок Authorization не передать (MSC3912), поэтому грузим
// через fetch и оборачиваем blob в object URL.
import { useEffect, useState } from 'react';
import { getClient } from '../../../../shared/lib/matrix';

export const useRoomListItemAvatar = (mxcUrl: string | null, size: number): string | null => {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!mxcUrl) return;

        let revoked: string | null = null;
        let cancelled = false;

        const load = async () => {
            const client = getClient();
            const httpUrl = client.mxcUrlToHttp(mxcUrl, size, size, 'crop', false, false, true);
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
