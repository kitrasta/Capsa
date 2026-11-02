// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';
import type { EditDraft, ReplyDraft } from '../hooks/useRoomDraft';
import ChatView from '../ChatView';

vi.mock('../../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../shared/lib/matrix')>()),
    getClient: vi.fn(),
}));

vi.mock('../hooks/useRoomReady', () => ({
    useRoomReady: () => room,
    useIsLoading: () => false,
}));
vi.mock('../hooks/useRoomTimeline', () => ({ useRoomTimeline: () => [] }));
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
    useAutoLoadHistory: () => ({ loading: false, loadMore: vi.fn() }),
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
    send.mockResolvedValue(undefined);
    edit.mockResolvedValue(undefined);
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

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
