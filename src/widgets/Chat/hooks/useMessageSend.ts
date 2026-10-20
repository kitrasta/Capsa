// Отправка сообщений и управление статусом печати.
import { useRef } from 'react';
import { TYPING_SEND_INTERVAL, TYPING_TIMEOUT } from '../constants';
import { getClient } from '../../../shared/lib/matrix';

export const useMessageSend = (roomId: string): {
    send: (text: string) => Promise<void>;
    typing: (value: string) => void;
} => {
    // отправка статуса печати: не чаще раза в 10 c,
    // сервер держит его 20 c, чтобы пережить сетевые лаги
    const lastTypingSentRef = useRef(-Infinity);

    const send = async (text: string): Promise<void> => {
        const client = getClient();
        try {
            await client.sendTextMessage(roomId, text);
        } catch (error) {
            console.error('Failed to send message:', error);
            // пробрасываем ошибку, чтобы компонент мог вернуть текст в input
            throw error;
        }
    };

    const typing = (value: string): void => {
        const client = getClient();
        if (value.trim() === '') {
            // поле опустело — перестаем «печатать»
            lastTypingSentRef.current = 0;
            client.sendTyping(roomId, false, TYPING_TIMEOUT).catch((error) => {
                console.error('Failed to send typing state:', error);
            });
            return;
        }

        const now = Date.now();
        if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL) return;

        lastTypingSentRef.current = now;
        client.sendTyping(roomId, true, TYPING_TIMEOUT).catch((error) => {
            console.error('Failed to send typing state:', error);
        });
    };

    return { send, typing };
};
