// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { toTimelineItems } = vi.hoisted(() => ({
    toTimelineItems: vi.fn(() => [{ kind: 'message', id: 'm1' }]),
}));

vi.mock('../../timelineItems', () => ({ toTimelineItems }));

import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { useTimelineItems } from '../useTimelineItems';

const messages = [{ getId: () => '$1' }] as unknown as MatrixEvent[];
const room = { roomId: '!room:example.org' } as unknown as Room;

const render = (props: { messages: MatrixEvent[]; room: Room | null; myUserId: string | null }) =>
    renderHook(({ messages, room, myUserId }) => useTimelineItems(messages, room, myUserId), {
        initialProps: props,
    });

beforeEach(() => {
    toTimelineItems.mockClear();
});

describe('useTimelineItems: мемоизация производной ленты', () => {
    it('не пересчитывает ленту при повторном рендере с теми же входами', () => {
        const props = { messages, room, myUserId: '@me:example.org' };
        const { result, rerender } = render(props);

        const first = result.current;
        rerender(props);

        expect(result.current).toBe(first);
        expect(toTimelineItems).toHaveBeenCalledTimes(1);
    });

    it('стабилен по ссылке, пока комната неизвестна', () => {
        const { result, rerender } = render({ messages, room: null, myUserId: null });
        const first = result.current;

        rerender({ messages, room: null, myUserId: null });

        expect(result.current).toBe(first);
        expect(toTimelineItems).toHaveBeenCalledTimes(1);
    });

    it('пересчитывает ленту при смене входов', () => {
        const { result, rerender } = render({ messages, room, myUserId: null });
        const first = result.current;

        rerender({ messages: [...messages], room, myUserId: null });
        rerender({ messages, room: { ...room } as unknown as Room, myUserId: null });
        rerender({ messages, room, myUserId: '@me:example.org' });

        expect(toTimelineItems).toHaveBeenCalledTimes(4);
        expect(result.current).not.toBe(first);
    });
});
