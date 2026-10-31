// Отправка сообщений и управление статусом печати.
//
// Отдельно — ответы (цитата) и редактирование: content строится в
// shared/lib/matrix/api/messages.ts и идёт через Matrix SDK
// с соответствующим m.relates_to. Реакции — отдельный тип события.
import { useCallback, useRef } from 'react';
import { TYPING_SEND_INTERVAL, TYPING_TIMEOUT } from '../constants';
import { getClient } from '../../../shared/lib/matrix';
import {
    sendReplyMessage,
    editMessage,
    toggleReaction as toggleReactionApi,
    type ReplyTarget,
} from '../../../shared/lib/matrix';

export const useMessageSend = (roomId: string): {
    send: (text: string, replyTo?: ReplyTarget) => Promise<void>;
    edit: (eventId: string, text: string) => Promise<void>;
    toggleReaction: (eventId: string, key: string) => Promise<void>;
    typing: (value: string) => void;
} => {
    // отправка статуса печати: не чаще раза в 10 c,
    // сервер держит его 20 c, чтобы пережить сетевые лаги
    const lastTypingSentRef = useRef(-Infinity);

    const send = useCallback(
        async (text: string, replyTo?: ReplyTarget): Promise<void> => {
            try {
                if (replyTo) {
                    await sendReplyMessage(roomId, replyTo, text);
                } else {
                    await getClient().sendTextMessage(roomId, text);
                }
            } catch (error) {
                console.error('Failed to send message:', error);
                // пробрасываем ошибку, чтобы компонент мог вернуть текст в input
                throw error;
            }
        },
        [roomId],
    );

    const edit = useCallback(
        async (eventId: string, text: string): Promise<void> => {
            try {
                await editMessage(roomId, eventId, text);
            } catch (error) {
                console.error('Failed to edit message:', error);
                // пробрасываем ошибку — компонент вернёт текст обратно в input
                throw error;
            }
        },
        [roomId],
    );

    const toggleReaction = useCallback(
        async (eventId: string, key: string): Promise<void> => {
            try {
                await toggleReactionApi(roomId, eventId, key);
            } catch (error) {
                console.error('Failed to toggle reaction:', error);
            }
        },
        [roomId],
    );

    const typing = useCallback(
        (value: string): void => {
            const client = getClient();
            if (value.trim() === '') {
                // поле опустело — перестаем «печатать».
                // -Infinity = явный сброс: следующий символ отправит typing сразу
                lastTypingSentRef.current = -Infinity;
                client
                    .sendTyping(roomId, false, TYPING_TIMEOUT)
                    .catch((error) => {
                        console.error('Failed to send typing state:', error);
                    });
                return;
            }

            const now = Date.now();
            if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL) return;

            lastTypingSentRef.current = now;
            client
                .sendTyping(roomId, true, TYPING_TIMEOUT)
                .catch((error) => {
                    console.error('Failed to send typing state:', error);
                });
        },
        [roomId],
    );

    return { send, edit, toggleReaction, typing };
};
