// Автозагрузка истории сообщений: подгрузка страниц вверх.
// Догружает сам, когда лента не заполняет вьюпорт (onScroll никогда не
// сработает), и по запросу компонента — loadMore(true) при доскролле до верха.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { SCROLLBACK_PAGE, SCROLL_LOAD_THRESHOLD } from '../constants';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';

export const useAutoLoadHistory = (
    room: Room | null | undefined,
    messagesLength: number,
    containerRef: RefObject<HTMLElement | null>,
    // вызывается до запроса: компонент захватывает якорь позиции чтения
    onBeforeLoad: (keepPosition: boolean) => void,
): { loading: boolean; loadMore: (keepPosition: boolean) => void } => {
    const [loading, setLoading] = useState(false);
    const isLoadingRef = useRef(false);
    const exhaustedRef = useRef(false);

    const loadHistory = async (keepPosition: boolean) => {
        if (!room || isLoadingRef.current) return;

        // дошли до начала истории — дальше запросов нет
        if (room.oldState.paginationToken === null || exhaustedRef.current) {
            exhaustedRef.current = true;
            return;
        }

        onBeforeLoad(keepPosition);

        const eventsBefore = room.getLiveTimeline().getEvents().length;
        isLoadingRef.current = true;
        setLoading(true);

        try {
            await getClient().scrollback(room, SCROLLBACK_PAGE);
            // история исчерпана, если у начала или событий не прибавилось
            // (защита от вечного цикла автозагрузки)
            const eventsAfter = room.getLiveTimeline().getEvents().length;
            if (room.oldState.paginationToken === null || eventsAfter === eventsBefore) {
                exhaustedRef.current = true;
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            isLoadingRef.current = false;
            setLoading(false);
        }
    };

    // автозаполнение: лента не заполняет вьюпорт — грузим сами,
    // пока не появится прокрутка или не исчерпается история
    useEffect(() => {
        if (!room || loading) return;
        const el = containerRef.current;
        if (!el) return;
        // уже есть прокрутка и мы не у верха — не мешаем юзеру
        if (el.scrollHeight > el.clientHeight && el.scrollTop > SCROLL_LOAD_THRESHOLD) return;
        void loadHistory(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, messagesLength, loading]);

    return { loading, loadMore: loadHistory };
};
