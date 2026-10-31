import { useEffect, useState } from 'react';

export interface ReplyDraft {
    id: string;
    senderName: string;
    body: string;
}

export interface EditDraft {
    id: string;
    body: string;
}

interface StoredDraft {
    text: string;
    replyDraft: ReplyDraft | null;
    editDraft: EditDraft | null;
}

const EMPTY_DRAFT: StoredDraft = {
    text: '',
    replyDraft: null,
    editDraft: null,
};

const storageKey = (userId: string, roomId: string): string =>
    `capsa.chat-draft.${encodeURIComponent(userId)}.${encodeURIComponent(roomId)}`;

const isReplyDraft = (value: unknown): value is ReplyDraft => {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<ReplyDraft>;
    return (
        typeof draft.id === 'string' &&
        typeof draft.senderName === 'string' &&
        typeof draft.body === 'string'
    );
};

const isEditDraft = (value: unknown): value is EditDraft => {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<EditDraft>;
    return typeof draft.id === 'string' && typeof draft.body === 'string';
};

const readDraft = (userId: string, roomId: string): StoredDraft => {
    try {
        const raw = localStorage.getItem(storageKey(userId, roomId));
        if (!raw) return EMPTY_DRAFT;
        const value = JSON.parse(raw) as Partial<StoredDraft>;
        return {
            text: typeof value.text === 'string' ? value.text : '',
            replyDraft: isReplyDraft(value.replyDraft) ? value.replyDraft : null,
            editDraft: isEditDraft(value.editDraft) ? value.editDraft : null,
        };
    } catch {
        // Повреждённый JSON или запрещённое хранилище не должны ломать чат.
        return EMPTY_DRAFT;
    }
};

const writeDraft = (userId: string, roomId: string, draft: StoredDraft): void => {
    try {
        const key = storageKey(userId, roomId);
        if (!draft.text && !draft.replyDraft && !draft.editDraft) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, JSON.stringify(draft));
    } catch {
        // В приватном режиме хранилище может быть недоступно — черновик
        // продолжит работать в памяти текущего компонента.
    }
};

export const useRoomDraft = (roomId: string, userId: string | null) => {
    const ownerId = userId ?? 'anonymous';
    // ChatsPage пересоздаёт ChatView при смене roomId, поэтому начальное
    // состояние читается именно для открытой комнаты.
    const [initialDraft] = useState(() => readDraft(ownerId, roomId));
    const [text, setText] = useState(initialDraft.text);
    const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(
        initialDraft.replyDraft,
    );
    const [editDraft, setEditDraft] = useState<EditDraft | null>(
        initialDraft.editDraft,
    );

    useEffect(() => {
        writeDraft(ownerId, roomId, { text, replyDraft, editDraft });
    }, [ownerId, roomId, text, replyDraft, editDraft]);

    return {
        text,
        setText,
        replyDraft,
        setReplyDraft,
        editDraft,
        setEditDraft,
    };
};
