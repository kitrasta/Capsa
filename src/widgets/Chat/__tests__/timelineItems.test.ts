import { describe, expect, it, vi } from 'vitest';

// matrix-js-sdk мокаем целиком: функции нужны только enum'ы и типы,
// runtime библиотеки не тянем (как в useRoomTimeline.test)
vi.mock('matrix-js-sdk', () => ({
    EventStatus: {
        SENDING: 'SENDING',
        QUEUED: 'QUEUED',
        ENCRYPTING: 'ENCRYPTING',
        SENT: 'SENT',
        NOT_SENT: 'NOT_SENT',
        CANCELLED: 'CANCELLED',
    },
}));

import { toTimelineItems, dateLabel } from '../timelineItems';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { MESSAGE_GROUP_TIME_GAP } from '../constants';

const makeEvent = (
    id: string,
    opts: { sender?: string; ts?: number; body?: string } = {},
): MatrixEvent =>
    ({
        getId: () => id,
        getType: () => 'm.room.message',
        getContent: () => ({ body: opts.body ?? `text-${id}` }),
        isRedacted: () => false,
        getSender: () => opts.sender ?? '@alice:example.org',
        getTs: () => opts.ts ?? 1700000000000,
        status: null,
    }) as unknown as MatrixEvent;

const room = {
    currentState: {
        getMember: (userId: string) => ({ name: userId }),
    },
} as unknown as Room;

// 12 ноября 2024, 12:00 по локали теста
const NOW = new Date(2024, 10, 12, 12, 0, 0).getTime();
// локальные дни: вчера (11 ноября) и сегодня (12 ноября)
const YESTERDAY = new Date(2024, 10, 11, 10, 0, 0).getTime();
const TODAY = new Date(2024, 10, 12, 10, 0, 0).getTime();

describe('dateLabel', () => {
    it('сегодняшние события — «Сегодня»', () => {
        expect(dateLabel(NOW - 60_000, NOW)).toBe('Сегодня');
    });

    it('вчерашние события — «Вчера»', () => {
        const yesterday = new Date(2024, 10, 11, 23, 59, 0).getTime();
        expect(dateLabel(yesterday, NOW)).toBe('Вчера');
    });

    it('старые события — полная дата', () => {
        const old = new Date(2024, 9, 1, 10, 0, 0).getTime();
        expect(dateLabel(old, NOW)).toBe('1 октября');
    });

    it('другой год добавляется в метку', () => {
        const oldYear = new Date(2023, 9, 1, 10, 0, 0).getTime();
        expect(dateLabel(oldYear, NOW)).toBe('1 октября 2023 г.');
    });
});

describe('toTimelineItems: разделители дат', () => {
    it('пустая лента — пустой список', () => {
        expect(toTimelineItems([], room, '@me:example.org', NOW)).toEqual([]);
    });

    it('без комнаты — пустой список', () => {
        const events = [makeEvent('m1')];
        expect(toTimelineItems(events, null, '@me:example.org', NOW)).toEqual([]);
    });

    it('разделитель стоит перед первым сообщением', () => {
        const items = toTimelineItems([makeEvent('m1', { ts: TODAY })], room, null, NOW);
        expect(items[0]).toMatchObject({ kind: 'date', label: 'Сегодня' });
        expect(items[1]).toMatchObject({ kind: 'message' });
    });

    it('смена суток добавляет новый разделитель', () => {
        const events = [
            makeEvent('m1', { ts: YESTERDAY }),
            makeEvent('m2', { ts: TODAY }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const dates = items.filter((i) => i.kind === 'date');
        expect(dates).toHaveLength(2);
        expect(dates[0]).toMatchObject({ label: 'Вчера' });
        expect(dates[1]).toMatchObject({ label: 'Сегодня' });
    });
});

describe('toTimelineItems: группировка', () => {
    it('подряд идущие сообщения одного автора в одну группу', () => {
        const events = [
            makeEvent('m1', { ts: TODAY }),
            makeEvent('m2', { ts: TODAY + 1000 }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages[0]).toMatchObject({ grouped: false });
        expect(messages[1]).toMatchObject({ grouped: true });
    });

    it('смена автора разрывает группу', () => {
        const events = [
            makeEvent('m1', { sender: '@alice:example.org', ts: TODAY }),
            makeEvent('m2', { sender: '@bob:example.org', ts: TODAY + 1000 }),
            makeEvent('m3', { sender: '@alice:example.org', ts: TODAY + 2000 }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages.map((m) => m.kind === 'message' && m.grouped)).toEqual([
            false, false, false,
        ]);
    });

    it('большой разрыв во времени разрывает группу', () => {
        const events = [
            makeEvent('m1', { ts: TODAY }),
            makeEvent('m2', { ts: TODAY + MESSAGE_GROUP_TIME_GAP + 1 }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages[1]).toMatchObject({ grouped: false });
    });

    it('граница допустимого разрыва — ещё группа', () => {
        const events = [
            makeEvent('m1', { ts: TODAY }),
            makeEvent('m2', { ts: TODAY + MESSAGE_GROUP_TIME_GAP }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages[1]).toMatchObject({ grouped: true });
    });

    it('после разделителя даты группа начинается заново', () => {
        const events = [
            makeEvent('m1', { ts: YESTERDAY }),
            makeEvent('m2', { ts: TODAY }),
        ];
        const items = toTimelineItems(events, room, null, NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages[1]).toMatchObject({ grouped: false });
    });

    it('свои сообщения группируются так же, как чужие', () => {
        const events = [
            makeEvent('m1', { sender: '@me:example.org', ts: TODAY }),
            makeEvent('m2', { sender: '@me:example.org', ts: TODAY + 1000 }),
        ];
        const items = toTimelineItems(events, room, '@me:example.org', NOW);
        const messages = items.filter((i) => i.kind === 'message');
        expect(messages[0]).toMatchObject({ grouped: false, view: { isOwn: true } });
        expect(messages[1]).toMatchObject({ grouped: true, view: { isOwn: true } });
    });

    it('isOwn определяется по myUserId', () => {
        const events = [makeEvent('m1', { sender: '@alice:example.org' })];
        const items = toTimelineItems(events, room, '@alice:example.org', NOW);
        const message = items.find((i) => i.kind === 'message');
        expect(message && message.kind === 'message' && message.view.isOwn).toBe(true);
    });
});
