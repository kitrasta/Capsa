// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { getClient } from '../../../../shared/lib/matrix';
import { useAutoLoadHistory } from '../useAutoLoadHistory';

const ROOM_ID = '!room:example.org';

const makeRoom = (events: unknown[], paginationToken: string | null = 'token') =>
    ({
        roomId: ROOM_ID,
        oldState: { paginationToken },
        getLiveTimeline: () => ({ getEvents: () => events }),
    }) as never;

const scrolledRef = { current: { scrollHeight: 1000, clientHeight: 500, scrollTop: 200 } };
const emptyViewRef = { current: { scrollHeight: 300, clientHeight: 500, scrollTop: 0 } };

const scrollback = vi.fn(async () => {});
const onBeforeLoad = vi.fn();

const render = (room: unknown, messagesLength: number, containerRef: { current: unknown }) =>
    renderHook(
        ({ length }) => useAutoLoadHistory(room as never, length, containerRef as never, onBeforeLoad),
        { initialProps: { length: messagesLength } },
    );

beforeEach(() => {
    scrollback.mockClear();
    onBeforeLoad.mockClear();
    vi.mocked(getClient).mockReset();
    vi.mocked(getClient).mockReturnValue({ scrollback } as unknown as ReturnType<typeof getClient>);
});

describe('useAutoLoadHistory: автозаполнение вьюпорта', () => {
    it('не грузит, если есть скролл (юзер сам тянет историю)', async () => {
        const { result } = render(makeRoom([{ id: 1 }]), 1, scrolledRef);

        await act(async () => {});
        expect(scrollback).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });

    it('грузит, если лента не заполняет вьюпорт', async () => {
        const room = makeRoom([{ id: 1 }]);
        const { result } = render(room, 1, emptyViewRef);

        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));
        expect(scrollback).toHaveBeenCalledWith(room, 40);
        // при автозаполнении позицию чтения не сохраняем
        expect(onBeforeLoad).toHaveBeenCalledWith(false);
        await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('пустая страница останавливает автозагрузку (без вечного цикла)', async () => {
        // события не растут → вторая загрузка не нужна
        const { result } = render(makeRoom([{ id: 1 }]), 1, emptyViewRef);

        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => {});
        expect(scrollback).toHaveBeenCalledTimes(1);
    });

    it('не грузит, если история уже исчерпана (paginationToken = null)', async () => {
        render(makeRoom([{ id: 1 }], null), 1, emptyViewRef);

        await act(async () => {});
        expect(scrollback).not.toHaveBeenCalled();
    });

    it('новое сообщение при пустом вьюпорте запускает догрузку', async () => {
        const events = Array.from({ length: 5 }, (_, i) => ({ id: i }));
        const { result, rerender } = render(makeRoom(events), 5, emptyViewRef);

        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.loading).toBe(false));

        rerender({ length: 6 });
        await act(async () => {});
        // история исчерпана после первой пустой страницы — новых запросов нет
        expect(scrollback).toHaveBeenCalledTimes(1);
    });
});

describe('useAutoLoadHistory: loadMore', () => {
    it('loadMore(true) сохраняет позицию чтения (onBeforeLoad(true))', async () => {
        const room = makeRoom([{ id: 1 }]);
        const { result } = render(room, 1, scrolledRef);

        act(() => {
            void result.current.loadMore(true);
        });

        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));
        expect(onBeforeLoad).toHaveBeenCalledWith(true);
    });

    it('повторный вызов во время загрузки игнорируется', async () => {
        let resolveScrollback: (() => void) | undefined;
        scrollback.mockImplementationOnce(
            () => new Promise<void>((resolve) => { resolveScrollback = resolve; }),
        );
        const { result } = render(makeRoom([{ id: 1 }]), 1, scrolledRef);

        act(() => {
            void result.current.loadMore(true);
            void result.current.loadMore(true);
        });
        await act(async () => {
            resolveScrollback?.();
        });

        expect(scrollback).toHaveBeenCalledTimes(1);
    });
});
