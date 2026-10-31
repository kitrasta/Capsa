import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClient } from '../../shared/lib/matrix';
import { useRoomReady, useIsLoading } from './hooks/useRoomReady';
import { useRoomTimeline } from './hooks/useRoomTimeline';
import { useTypingStatus } from './hooks/useTypingStatus';
import { useScrollPosition } from './hooks/useScrollPosition';
import { useAutoLoadHistory } from './hooks/useAutoLoadHistory';
import { useMessageSend } from './hooks/useMessageSend';
import { useMarkRead } from './hooks/useMarkRead';
import { Avatar } from '../../shared/ui/Avatar';
import MessageBubble from './MessageBubble';
import { toTimelineItems } from './timelineItems';
import { SCROLL_LOAD_THRESHOLD } from './constants';
import styles from './ChatView.module.css';
import type { MessageView } from './messageView';

interface Props {
    roomId: string;
}

/** Ответ на конкретное сообщение: на что отвечаем и как это показать. */
interface ReplyDraft {
    id: string;
    senderName: string;
    body: string;
}

/** Правка сообщения: id + старое тело, которое возвращаем в input при ошибке. */
interface EditDraft {
    id: string;
    body: string;
}

const ChatView = ({ roomId }: Props) => {
    const navigate = useNavigate();
    const client = getClient();

    // комната может еще не быть в сторе (F5, sync не завершился);
    // isLoading — начальный sync идёт, или комната просто недоступна
    const room = useRoomReady(roomId);
    const isLoading = useIsLoading();

    const messages = useRoomTimeline(room);
    const typingStatus = useTypingStatus(room);
    const { isAtBottom, bottomRef, updateScrollPosition, forceScrollToBottom } =
        useScrollPosition(messages.length);

    const messagesRef = useRef<HTMLDivElement>(null);
    // позиция до подгрузки истории: {scrollHeight, scrollTop}
    const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

    // захват якоря перед подгрузкой; компенсация — в useLayoutEffect ниже
    const onBeforeLoad = useCallback((keepPosition: boolean) => {
        const el = messagesRef.current;
        if (!el || !keepPosition) return;
        scrollAnchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
    }, []);
    const { loading, loadMore } = useAutoLoadHistory(room, messages.length, messagesRef, onBeforeLoad);

    const { send, edit, toggleReaction, typing } = useMessageSend(roomId);
    // прочтение: при открытии, при новых сообщениях (если внизу) и при доскролле вниз
    useMarkRead(room, isAtBottom, messages.length);

    const [text, setText] = useState('');
    // юзер пишет прямо сейчас — статус печати других показываем в подсказке
    const [inputFocused, setInputFocused] = useState(false);

    // черновик ответа / правки: над полем ввода показывается полоска с
    // «кто/что» + текст, крестик сбрасывает черновик
    const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
    const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

    // компенсация скролла при пагинации: удерживаем ту же точку чтения
    useLayoutEffect(() => {
        const el = messagesRef.current;
        const anchor = scrollAnchorRef.current;
        if (!el || !anchor) return;
        if (el.scrollHeight > anchor.scrollHeight) {
            el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
            scrollAnchorRef.current = null;
        }
    }, [messages.length]);

    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;
        updateScrollPosition(el);
        // пагинация: дотянули до верха — тянем историю
        if (el.scrollTop <= SCROLL_LOAD_THRESHOLD) loadMore(true);
    };

    const handleScrollToReply = useCallback(
        (messageId: string) => {
            const el = messagesRef.current?.querySelector(`[data-event-id="${messageId}"]`) as HTMLElement | null;
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
        [],
    );

    const handleReply = useCallback(
        (view: MessageView) => {
            setReplyDraft({ id: view.id, senderName: view.senderName, body: view.body });
        },
        [],
    );

    const handleEdit = useCallback(
        (view: MessageView) => {
            setEditDraft({ id: view.id, body: view.body });
            setText(view.body);
        },
        [],
    );

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;

        // режим правки: content с m.replace, input очищаем после успеха
        if (editDraft) {
            const saved = text;
            try {
                await edit(editDraft.id, value);
                setText('');
                setEditDraft(null);
            } catch {
                setText(saved); // edit уже залогировал ошибку — вернули текст
            }
            return;
        }

        setText('');
        typing('');
        // юзер сам пишет — хочет видеть своё сообщение
        forceScrollToBottom();
        const replyTo = replyDraft ? { id: replyDraft.id, sender: replyDraft.senderName, body: replyDraft.body } : undefined;
        setReplyDraft(null);
        try {
            await send(value, replyTo);
        } catch {
            setText(value); // send уже залогировал ошибку — вернули текст
            if (replyDraft) {
                setReplyDraft({ id: replyDraft.id, senderName: replyDraft.senderName, body: replyDraft.body });
            }
        }
    };

    if (!room) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.empty}>
                    {isLoading ? 'Комната загружается…' : 'Комната недоступна'}
                </div>
            </div>
        );
    }

    const memberCount = room.getJoinedMemberCount();
    const hint = replyDraft
        ? `Ответ на сообщение…`
        : editDraft
          ? `Редактирование…`
          : inputFocused && typingStatus
            ? typingStatus
            : `Написать в ${room.name || room.roomId}…`;

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <button className={styles.backButton} onClick={() => navigate('/chats')} aria-label="Назад к списку чатов">←</button>
                <Avatar room={room} size={40} />
                <div className={styles.headerInfo}>
                    <div className={styles.headerName}>
                        {room.name}
                        {room.hasEncryptionStateEvent() && (
                            <span className={styles.encryptionIcon} title="Сквозное шифрование">🔒</span>
                        )}
                    </div>
                    <div className={styles.headerStatus}>{typingStatus ?? `${memberCount} участник.`}</div>
                </div>
            </header>

            <div className={styles.messages} ref={messagesRef} onScroll={handleScroll}>
                {loading && <div className={styles.historyLoader}>Загрузка истории…</div>}
                {toTimelineItems(messages, room, client.getUserId()).map((item) =>
                    item.kind === 'date' ? (
                        <div key={item.id} className={styles.dateSeparator}>{item.label}</div>
                    ) : (
                        // снимок видимых данных: пузырь чистовой, memo пропускает
                        // ре-рендеры, кроме изменившихся (например, расшифрованных)
                        <MessageBubble
                            key={item.id}
                            message={item.view}
                            grouped={item.grouped}
                            onReply={handleReply}
                            onEdit={handleEdit}
                            onToggleReaction={(id, key) => {
                                toggleReaction(id, key).catch(console.error);
                            }}
                            onReplyClick={handleScrollToReply}
                        />,
                    ),
                )}
                <div ref={bottomRef} />
            </div>

            {/* черновик ответа: цитата над полем ввода */}
            {replyDraft && (
                <div className={styles.contextBar}>
                    <div className={styles.contextBarBody}>
                        <span className={styles.contextBarSender}>{replyDraft.senderName}</span>
                        <span className={styles.contextBarText}>{replyDraft.body}</span>
                    </div>
                    <button
                        className={styles.contextBarCancel}
                        onClick={() => setReplyDraft(null)}
                        aria-label="Отменить ответ"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* черновик правки: та же полоска, но с пометкой */}
            {editDraft && (
                <div className={styles.contextBar}>
                    <div className={styles.contextBarBody}>
                        <span className={styles.contextBarLabel}>Правка</span>
                        <span className={styles.contextBarText}>{editDraft.body}</span>
                    </div>
                    <button
                        className={styles.contextBarCancel}
                        onClick={() => {
                            setEditDraft(null);
                            setText('');
                        }}
                        aria-label="Отменить правку"
                    >
                        ✕
                    </button>
                </div>
            )}

            <form className={styles.inputRow} onSubmit={handleSubmit}>
                <input
                    className={styles.input}
                    type="text"
                    placeholder={hint}
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        // не подаём сигнал печати во время правки
                        if (!editDraft) {
                            typing(e.target.value);
                        }
                    }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    autoFocus
                />
                <button className={styles.sendButton} type="submit" disabled={!text.trim()} aria-label="Отправить">→</button>
            </form>
        </div>
    );
};

export default ChatView;
