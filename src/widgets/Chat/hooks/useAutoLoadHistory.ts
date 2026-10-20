// Автозагрузка истории сообщений: подгрузка страниц вверх при скролле
// или при пустом вьюпорте.
import { useEffect, useRef, useState } from 'react';
import { SCROLLBACK_PAGE } from '../constants';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';

export const useAutoLoadHistory = (
    room: Room | null | undefined,
    messagesLength: number,
    onBeforeLoad: (keepPosition: boolean) => void,
): { loading: boolean; loadMore: (keepPosition: boolean) => void } => {
    const [loading, setLoading] = useState(false);
    const isLoadingHistoryRef = useRef(false);
    const historyExhaustedRef = useRef(false);

    const loadHistory = async (keepPosition: boolean) => {
        if (!room || isLoadingHistoryRef.current) return;

        if (room.oldState.paginationToken === null || historyExhaustedRef.current) {
            historyExhaustedRef.current = true;
            return;
        }

        onBeforeLoad(keepPosition);

        const eventsBefore = room.getLiveTimeline().getEvents().length;
        isLoadingHistoryRef.current = true;
        setLoading(true);

        try {
            const client = getClient();
            await client.scrollback(room, SCROLLBACK_PAGE);

            const eventsAfter = room.getLiveTimeline().getEvents().length;
            if (
                room.oldState.paginationToken === null ||
                eventsAfter === eventsBefore
            ) {
                historyExhaustedRef.current = true;
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            isLoadingHistoryRef.current = false;
            setLoading(false);
        }
    };

    useEffect(() => {
        // depend on messagesLength to trigger the check in component
    }, [messagesLength]);

    return { loading, loadMore: loadHistory };
};
