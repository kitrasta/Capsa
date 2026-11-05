// Отметка сообщений как прочитанных (read markers).
//
// Триггеры (все — через эффект):
//   - открытие комнаты (atBottom сразу true);
//   - новые сообщения / LocalEchoUpdated, если юзер внизу (messages array);
//   - доскролл вниз: useScrollPosition поднимает atBottom false→true.
// Таймер 200ms — даём автоскроллу отработать, прежде чем отметим прочтение.
import { useEffect, useRef } from 'react';
import { getClient } from '../../../shared/lib/matrix';
import { EventStatus, NotificationCountType } from 'matrix-js-sdk';
import type { MatrixEvent, Room } from 'matrix-js-sdk';

export const useMarkRead = (
    room: Room | null | undefined,
    atBottom: boolean,
    messages: MatrixEvent[],
): void => {
    // последний отмеченный eventId — чтобы не слать повторные запросы
    const lastMarkedEventIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!room || !atBottom) return;

        const timer = setTimeout(() => {
            // Read marker принимает только событие, уже известное серверу.
            // Видимая лента может заканчиваться pending/failed local echo.
            let lastEvent: MatrixEvent | undefined;
            for (let i = messages.length - 1; i >= 0; i -= 1) {
                const event = messages[i];
                const eventId = event.getId();
                const serverAcknowledged =
                    event.status === null || event.status === EventStatus.SENT;
                if (eventId?.startsWith('$') && serverAcknowledged) {
                    lastEvent = event;
                    break;
                }
            }
            const lastEventId = lastEvent?.getId();
            if (!lastEvent || !lastEventId || lastEventId === lastMarkedEventIdRef.current) return;

            lastMarkedEventIdRef.current = lastEventId;
            getClient()
                // m.fully_read + m.read: receipt нужен, чтобы sync и reload
                // не восстановили серверный unread count.
                .setRoomReadMarkers(room.roomId, lastEventId, lastEvent)
                .then(() => {
                    // SDK сам эмитит RoomEvent.UnreadNotifications: тот же
                    // RoomListItem пересчитает badge без локального UI-workaround.
                    room.setUnreadNotificationCount(NotificationCountType.Total, 0);
                })
                .catch((error) => {
                    console.error('Failed to mark room as read:', error);
                    // неудачу можно повторить при следующем триггере
                    lastMarkedEventIdRef.current = null;
                });
        }, 200);

        return () => clearTimeout(timer);
    }, [room, atBottom, messages]);
};
