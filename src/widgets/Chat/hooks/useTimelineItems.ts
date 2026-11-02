// Производная лента (пузыри + разделители дат) — дорогой чистый пересчёт
// над всеми событиями. useMemo держит ссылку стабильной, пока не изменились
// входы: ввод текста/фокус/ответ/правка перерисовывают ChatView, но ленту
// не трогают — без мемоизации каждый keystroke пересчитывал всю ленту.
import { useMemo } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { toTimelineItems, type TimelineItem } from '../timelineItems';

export const useTimelineItems = (
    messages: MatrixEvent[],
    room: Room | null | undefined,
    myUserId: string | null,
): TimelineItem[] =>
    useMemo(() => toTimelineItems(messages, room, myUserId), [messages, room, myUserId]);
