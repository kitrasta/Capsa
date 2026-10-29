// Лента → элементы рендера: пузыри сообщений плюс разделители дат
// и признак группировки (Telegram-стиль: подряд идущие сообщения одного
// автора сливаются в группу без повторения имени).
//
// Чистая функция: на вход события и комната, на выход снимки данных.
// MatrixEvent мутирует (расшифровка, статус отправки) при неизменном
// identity — поэтому снимок берётся здесь, на момент пересчёта ленты.
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { toMessageView, type MessageView } from './messageView';
import { MESSAGE_GROUP_TIME_GAP } from './constants';

export type TimelineItem =
    | { kind: 'date'; id: string; label: string }
    | { kind: 'message'; id: string; view: MessageView; grouped: boolean };

// локальное начало суток: сравнение дней должно быть локальным,
// как и метки дат в интерфейсе
const startOfDay = (ts: number): number => {
    const date = new Date(ts);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

// метка разделителя: «Сегодня» / «Вчера» / «12 октября» / «12 октября 2024 г.»
export const dateLabel = (ts: number, nowTs: number = Date.now()): string => {
    const day = startOfDay(ts);
    const today = startOfDay(nowTs);

    if (day === today) return 'Сегодня';
    if (day === startOfDay(nowTs - 24 * 60 * 60 * 1000)) return 'Вчера';

    const date = new Date(ts);
    const withYear = date.getFullYear() !== new Date(nowTs).getFullYear();
    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        ...(withYear ? { year: 'numeric' } : {}),
    });
};

export const toTimelineItems = (
    events: MatrixEvent[],
    room: Room | null | undefined,
    myUserId: string | null,
    nowTs: number = Date.now(),
): TimelineItem[] => {
    if (!room) return [];

    const items: TimelineItem[] = [];
    // контекст предыдущего сообщения для группировки и смены дня
    let prevSender: string | null = null;
    let prevTs = 0;
    let prevDay = 0;

    for (const event of events) {
        const ts = event.getTs();
        const day = startOfDay(ts);
        const senderId = event.getSender() ?? '';

        // смена суток — разделитель; после него группа начинается заново
        if (day !== prevDay) {
            items.push({ kind: 'date', id: `date-${day}`, label: dateLabel(ts, nowTs) });
            prevDay = day;
            prevSender = null;
        }

        // группа: тот же автор подряд, без заметного разрыва во времени.
        // Свои сообщения группируются так же, как чужие
        const grouped =
            prevSender === senderId &&
            ts >= prevTs &&
            ts - prevTs <= MESSAGE_GROUP_TIME_GAP;

        const view = toMessageView(event, room, senderId === myUserId);
        items.push({ kind: 'message', id: view.id, view, grouped });
        prevSender = senderId;
        prevTs = ts;
    }

    return items;
};
