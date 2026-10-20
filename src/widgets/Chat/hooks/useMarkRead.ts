// Отметка сообщений как прочитанных (read markers).
//
// Триггеры (все — через эффект):
//   - открытие комнаты (atBottom сразу true);
//   - новые сообщения, если юзер внизу (messagesLength);
//   - доскролл вниз: useScrollPosition поднимает atBottom false→true.
// Таймер 200ms — даём автоскроллу отработать, прежде чем отметим прочтение.
import { useEffect, useRef } from 'react';
import { getClient } from '../../../shared/lib/matrix';
import type { Room } from 'matrix-js-sdk';

export const useMarkRead = (
    room: Room | null | undefined,
    atBottom: boolean,
    messagesLength: number,
): void => {
    // последний отмеченный eventId — чтобы не слать повторные запросы
    const lastMarkedEventIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!room || !atBottom) return;

        const timer = setTimeout(() => {
            const lastEvent = room.getLastLiveEvent();
            const lastEventId = lastEvent?.getId();
            if (!lastEventId || lastEventId === lastMarkedEventIdRef.current) return;

            lastMarkedEventIdRef.current = lastEventId;
            getClient()
                .setRoomReadMarkers(room.roomId, lastEventId)
                .catch((error) => {
                    console.error('Failed to mark room as read:', error);
                    // неудачу можно повторить при следующем триггере
                    lastMarkedEventIdRef.current = null;
                });
        }, 200);

        return () => clearTimeout(timer);
    }, [room, atBottom, messagesLength]);
};
