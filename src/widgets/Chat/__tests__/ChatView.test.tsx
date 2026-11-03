// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';
import { useRoomReady } from '../hooks/useRoomReady';
import { useRoomTimeline } from '../hooks/useRoomTimeline';
import { useAutoLoadHistory } from '../hooks/useAutoLoadHistory';
import type { EditDraft, ReplyDraft } from '../hooks/useRoomDraft';
import ChatView from '../ChatView';

vi.mock('../../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../shared/lib/matrix')>()),
    getClient: vi.fn(),
}));

vi.mock('../hooks/useRoomReady', () => ({
    useRoomReady: vi.fn(() => room),
    useIsLoading: () => false,
}));
vi.mock('../hooks/useRoomTimeline', () => ({ useRoomTimeline: vi.fn(() => []) }));
vi.mock('../hooks/useTypingStatus', () => ({ useTypingStatus: () => null }));
vi.mock('../hooks/useScrollPosition', () => ({
    useScrollPosition: () => ({
        isAtBottom: true,
        bottomRef: { current: null },
        updateScrollPosition: vi.fn(),
        forceScrollToBottom: vi.fn(),
    }),
}));
vi.mock('../hooks/useAutoLoadHistory', () => ({
    useAutoLoadHistory: vi.fn(() => ({ loading: false, loadMore: vi.fn() })),
}));
vi.mock('../hooks/useMarkRead', () => ({ useMarkRead: vi.fn() }));
vi.mock('../hooks/useMessageSend', () => ({
    useMessageSend: () => ({ send, edit, toggleReaction, typing }),
}));

const ROOM_ID = '!room:example.org';
const USER_ID = '@me:example.org';
const DRAFT_KEY =
    'capsa.chat-draft.%40me%3Aexample.org.!room%3Aexample.org';

const send = vi.fn();
const edit = vi.fn();
const toggleReaction = vi.fn();
const typing = vi.fn();

const room = {
    roomId: ROOM_ID,
    name: 'Тестовая комната',
    currentState: { on: vi.fn(), off: vi.fn() },
    getJoinedMemberCount: () => 2,
    hasEncryptionStateEvent: () => false,
    getMxcAvatarUrl: () => null,
} as unknown as Room;

const replyDraft: ReplyDraft = {
    id: '$reply',
    senderId: '@alice:example.org',
    senderName: 'Alice',
    body: 'Исходное сообщение',
};

const editDraft: EditDraft = {
    id: '$edit',
    body: 'Исходный текст',
};

const seedDraft = (
    text: string,
    drafts: { replyDraft?: ReplyDraft; editDraft?: EditDraft } = {},
) => {
    localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
            text,
            replyDraft: drafts.replyDraft ?? null,
            editDraft: drafts.editDraft ?? null,
        }),
    );
};

const renderChat = () =>
    render(
        <MemoryRouter>
            <ChatView roomId={ROOM_ID} />
        </MemoryRouter>,
    );

const getComposer = () =>
    screen.getByRole('textbox', { name: 'Сообщение' }) as HTMLTextAreaElement;

const submitComposer = () => {
    const form = getComposer().form;
    if (!form) throw new Error('Composer form is missing');
    fireEvent.submit(form);
};

const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const storedDraft = () => {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(getClient).mockReturnValue({
        getUserId: () => USER_ID,
    } as unknown as MatrixClient);
    vi.mocked(useRoomReady).mockReturnValue(room);
    vi.mocked(useRoomTimeline).mockReturnValue([]);
    vi.mocked(useAutoLoadHistory).mockReturnValue({ loading: false, loadMore: vi.fn() });
    send.mockResolvedValue(undefined);
    edit.mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
});

const makeMessage = (id: string, ts: number): MatrixEvent =>
    ({
        getId: () => id,
        getSender: () => '@alice:example.org',
        getTs: () => ts,
        getContent: () => ({ body: id, msgtype: 'm.text' }),
        getRelation: () => null,
        replacingEventId: () => undefined,
        isRedacted: () => false,
        replyEventId: undefined,
        status: null,
    }) as unknown as MatrixEvent;

describe('ChatView: composer drafts', () => {
    it('восстанавливает текст и активный reply draft после rejected send', async () => {
        const pending = deferred();
        send.mockReturnValueOnce(pending.promise);
        seedDraft('Ответ с ошибкой', { replyDraft });
        renderChat();

        submitComposer();
        await waitFor(() => expect(getComposer().value).toBe(''));
        expect(screen.queryByText(replyDraft.body)).toBeNull();

        await act(async () => {
            pending.reject(new Error('network down'));
        });

        await waitFor(() => expect(getComposer().value).toBe('Ответ с ошибкой'));
        expect(screen.getByText(replyDraft.senderName)).toBeTruthy();
        expect(screen.getByText(replyDraft.body)).toBeTruthy();
        await waitFor(() =>
            expect(storedDraft()).toEqual({
                text: 'Ответ с ошибкой',
                replyDraft,
                editDraft: null,
            }),
        );
    });

    it('восстанавливает текст и edit draft после rejected edit', async () => {
        const pending = deferred();
        edit.mockReturnValueOnce(pending.promise);
        seedDraft('Исправленный текст', { editDraft });
        renderChat();

        submitComposer();
        expect(edit).toHaveBeenCalledWith('$edit', 'Исправленный текст');
        fireEvent.change(getComposer(), { target: { value: 'Временный ввод' } });

        await act(async () => {
            pending.reject(new Error('network down'));
        });

        await waitFor(() => expect(getComposer().value).toBe('Исправленный текст'));
        expect(screen.getByText(editDraft.body)).toBeTruthy();
        await waitFor(() =>
            expect(storedDraft()).toEqual({
                text: 'Исправленный текст',
                replyDraft: null,
                editDraft,
            }),
        );
    });

    it('после успешной отправки очищает текст и reply draft', async () => {
        seedDraft('Успешный ответ', { replyDraft });
        renderChat();

        submitComposer();

        await waitFor(() => expect(getComposer().value).toBe(''));
        expect(screen.queryByText(replyDraft.body)).toBeNull();
        expect(send).toHaveBeenCalledWith('Успешный ответ', {
            id: '$reply',
            senderId: '@alice:example.org',
            body: 'Исходное сообщение',
        });
        await waitFor(() => expect(storedDraft()).toBeNull());
    });

    it('после успешной правки очищает текст и edit draft', async () => {
        seedDraft('Исправленный текст', { editDraft });
        renderChat();

        submitComposer();

        await waitFor(() => expect(getComposer().value).toBe(''));
        expect(screen.queryByText(editDraft.body)).toBeNull();
        expect(edit).toHaveBeenCalledWith('$edit', 'Исправленный текст');
        await waitFor(() => expect(storedDraft()).toBeNull());
    });

    it('не отправляет сообщение по Enter во время IME composition', () => {
        seedDraft('Текст с IME');
        renderChat();

        fireEvent.keyDown(getComposer(), {
            key: 'Enter',
            shiftKey: false,
            isComposing: true,
        });

        expect(getComposer().value).toBe('Текст с IME');
        expect(send).not.toHaveBeenCalled();
        expect(edit).not.toHaveBeenCalled();
    });
});

describe('ChatView: pagination scroll anchor', () => {
    it('сохраняет offset первого сообщения и не загружает вторую страницу auto-fill', async () => {
        const anchor = makeMessage('$anchor', 2);
        let timeline = [anchor, makeMessage('$last', 3)];
        const paginationRoom = {
            ...room,
            oldState: { paginationToken: 'page-2' },
            getLiveTimeline: () => ({ getEvents: () => timeline }),
            findEventById: () => null,
            getUnfilteredTimelineSet: () => ({
                relations: { getChildEventsForEvent: () => null },
            }),
            currentState: {
                getMember: () => ({ name: 'Alice' }),
                on: vi.fn(),
                off: vi.fn(),
            },
        } as unknown as Room;
        vi.mocked(useRoomReady).mockReturnValue(paginationRoom);
        vi.mocked(useRoomTimeline).mockImplementation(() => timeline);
        const { useAutoLoadHistory: realUseAutoLoadHistory } = await vi.importActual<
            typeof import('../hooks/useAutoLoadHistory')
        >('../hooks/useAutoLoadHistory');
        vi.mocked(useAutoLoadHistory).mockImplementation(realUseAutoLoadHistory);

        const firstPage = deferred();
        const scrollback = vi.fn()
            .mockImplementationOnce(async () => {
                await firstPage.promise;
                timeline = [makeMessage('$older-1', 0), makeMessage('$older-2', 1), ...timeline];
                paginationRoom.oldState.paginationToken = 'page-1';
            })
            .mockImplementation(() => new Promise<void>(() => {}));
        vi.mocked(getClient).mockReturnValue({
            getUserId: () => USER_ID,
            scrollback,
        } as unknown as MatrixClient);

        let scrollTop = 200;
        let scrollHeight = 600;
        vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(300);
        vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(() => scrollHeight);
        vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrollTop);
        // Эмулирует CSS scroll-behavior: smooth из production:
        // прямое присваивание не меняет текущий offset синхронно.
        vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(() => {});
        const view = renderChat();
        const container = document.querySelector('[class*="_messages_"]') as HTMLDivElement;
        expect(container).not.toBeNull();
        container.scrollTo = vi.fn(({ top, behavior }: ScrollToOptions) => {
            if (behavior === 'instant') scrollTop = top ?? 0;
        }) as typeof container.scrollTo;
        const anchorElement = container.querySelector('[data-event-id="$anchor"]') as HTMLElement;
        anchorElement.getBoundingClientRect = () =>
            ({ top: 128 + (scrollHeight - 600) - scrollTop }) as DOMRect;

        await act(async () => {});
        expect(scrollback).not.toHaveBeenCalled();
        scrollTop = 0;
        fireEvent.scroll(container);
        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));
        expect(anchorElement.getBoundingClientRect().top).toBe(128);

        scrollHeight = 1100;
        await act(async () => {
            firstPage.resolve();
            await firstPage.promise;
        });
        view.rerender(
            <MemoryRouter>
                <ChatView roomId={ROOM_ID} />
            </MemoryRouter>,
        );
        await act(async () => {});

        expect(scrollback).toHaveBeenCalledTimes(1);
        expect(container.scrollTop).toBe(500);
        expect(anchorElement.getBoundingClientRect().top).toBe(128);
    });

    const renderStaleAnchorHarness = async (scrollback: ReturnType<typeof vi.fn>) => {
        const initialTimeline = [makeMessage('$anchor', 2), makeMessage('$last', 3)];
        let currentTimeline = initialTimeline;
        let currentRoom = {
            ...room,
            oldState: { paginationToken: 'page-2' },
            getLiveTimeline: () => ({ getEvents: () => currentTimeline }),
            findEventById: () => null,
            getUnfilteredTimelineSet: () => ({
                relations: { getChildEventsForEvent: () => null },
            }),
            currentState: {
                getMember: () => ({ name: 'Alice' }),
                on: vi.fn(),
                off: vi.fn(),
            },
        } as unknown as Room;
        vi.mocked(useRoomReady).mockImplementation(() => currentRoom);
        vi.mocked(useRoomTimeline).mockImplementation(() => currentTimeline);
        const { useAutoLoadHistory: realUseAutoLoadHistory } = await vi.importActual<
            typeof import('../hooks/useAutoLoadHistory')
        >('../hooks/useAutoLoadHistory');
        vi.mocked(useAutoLoadHistory).mockImplementation(realUseAutoLoadHistory);
        vi.mocked(getClient).mockReturnValue({
            getUserId: () => USER_ID,
            scrollback,
        } as unknown as MatrixClient);

        const geometry = { scrollTop: 200, scrollHeight: 600, clientHeight: 300 };
        vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(
            () => geometry.clientHeight,
        );
        vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(
            () => geometry.scrollHeight,
        );
        vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(
            () => geometry.scrollTop,
        );
        vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(() => {});
        const view = renderChat();
        const container = document.querySelector('[class*="_messages_"]') as HTMLDivElement;
        container.scrollTo = vi.fn(({ top, behavior }: ScrollToOptions) => {
            if (behavior === 'instant') geometry.scrollTop = top ?? 0;
        }) as typeof container.scrollTo;
        await act(async () => {});
        expect(scrollback).not.toHaveBeenCalled();

        return {
            container,
            geometry,
            startManualPagination: () => {
                geometry.scrollTop = 0;
                fireEvent.scroll(container);
            },
            changeRoom: (nextRoom: Room, nextTimeline: MatrixEvent[], nextRoomId: string) => {
                currentRoom = nextRoom;
                currentTimeline = nextTimeline;
                view.rerender(
                    <MemoryRouter>
                        <ChatView roomId={nextRoomId} />
                    </MemoryRouter>,
                );
            },
        };
    };

    it('после failed pagination очищает stale anchor и возобновляет auto-fill', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const scrollback = vi.fn()
            .mockRejectedValueOnce(new Error('network down'))
            .mockImplementationOnce(async (targetRoom: Room) => {
                targetRoom.oldState.paginationToken = null;
            });
        const { startManualPagination } = await renderStaleAnchorHarness(scrollback);

        startManualPagination();
        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));
        await act(async () => {});

        expect(scrollback).toHaveBeenCalledTimes(2);
    });

    it('при смене комнаты не переносит pending anchor в короткую ленту', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const firstPage = deferred();
        const scrollback = vi.fn()
            .mockImplementationOnce(() => firstPage.promise)
            .mockImplementationOnce(async (targetRoom: Room) => {
                targetRoom.oldState.paginationToken = null;
            });
        const { geometry, startManualPagination, changeRoom } =
            await renderStaleAnchorHarness(scrollback);
        startManualPagination();
        await waitFor(() => expect(scrollback).toHaveBeenCalledTimes(1));

        const shortTimeline = [makeMessage('$short', 10)];
        const shortRoom = {
            ...room,
            roomId: '!short:example.org',
            oldState: { paginationToken: 'short-page' },
            getLiveTimeline: () => ({ getEvents: () => shortTimeline }),
            findEventById: () => null,
            getUnfilteredTimelineSet: () => ({
                relations: { getChildEventsForEvent: () => null },
            }),
            currentState: {
                getMember: () => ({ name: 'Alice' }),
                on: vi.fn(),
                off: vi.fn(),
            },
        } as unknown as Room;
        geometry.scrollHeight = 250;
        geometry.scrollTop = 0;
        changeRoom(shortRoom, shortTimeline, shortRoom.roomId);
        await act(async () => {
            firstPage.reject(new Error('room changed'));
        });
        await act(async () => {});

        expect(scrollback).toHaveBeenCalledTimes(2);
        expect(scrollback).toHaveBeenLastCalledWith(shortRoom, 40);
    });
});
