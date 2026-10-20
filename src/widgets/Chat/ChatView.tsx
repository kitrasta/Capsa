import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClient } from '../../shared/lib/matrix';
import { useRoomReady, useIsLoading } from './hooks/useRoomReady';
import { useRoomTimeline } from './hooks/useRoomTimeline';
import { useTypingStatus } from './hooks/useTypingStatus';
import { useScrollPosition } from './hooks/useScrollPosition';
import { useAutoLoadHistory } from './hooks/useAutoLoadHistory';
import { Avatar } from '../../shared/ui/Avatar';
import MessageBubble from './MessageBubble';
import styles from './ChatView.module.css';
import { SCROLL_LOAD_THRESHOLD, TYPING_SEND_INTERVAL, TYPING_TIMEOUT } from './constants';

interface Props {
    roomId: string;
}

const ChatView = ({ roomId }: Props) => {
    const navigate = useNavigate();
    const client = getClient();

    // комната может еще не быть в сторе (F5, sync не завершился) —
    // поэтому отслеживаем её появление реактивно
    const room = useRoomReady(roomId);
    // начальный sync идёт — или комната просто недоступна
    const isLoading = useIsLoading();

    const [text, setText] = useState('');
    const messagesRef = useRef<HTMLDivElement>(null);
    const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
    const lastTypingSentRef = useRef(0);

    // лента сообщений: события/локальные эхо/расшифровка — в хуке
    const messages = useRoomTimeline(room);

    // позиция скролла: «у нижнего края» решает автоскролл
    const { isAtBottom, bottomRef, updateScrollPosition, forceScrollToBottom } =
        useScrollPosition(messages.length);

    // статус печати других участников — в хуке
    const typingStatus = useTypingStatus(room);

    // автозагрузка истории: подгрузка страниц вверх при скролле или пустом вьюпорте
    const { loading: historyLoading, loadMore } = useAutoLoadHistory(
        room,
        messages.length,
        (keepPosition) => {
            const el = messagesRef.current;
            if (!el) return;
            if (keepPosition) {
                scrollAnchorRef.current = {
                    scrollHeight: el.scrollHeight,
                    scrollTop: el.scrollTop,
                };
            }
        },
    );

    // помечаем комнату прочитанной, когда юзер видит последние сообщения:
    // при открытии комнаты и при новых сообщениях, если он внизу
    const lastMarkedEventIdRef = useRef<string | null>(null);
    const markRead = () => {
        if (!room) return;

        const lastEvent = room.getLastLiveEvent();
        const lastEventId = lastEvent?.getId();
        if (!lastEventId || lastEventId === lastMarkedEventIdRef.current) return;

        lastMarkedEventIdRef.current = lastEventId;
        client
            .setRoomReadMarkers(roomId, lastEventId)
            .catch((error) => {
                console.error('Failed to mark room as read:', error);
                lastMarkedEventIdRef.current = null;
            });
    };

    useEffect(() => {
        if (!room || !isAtBottom) return;

        // даём автоскроллу отработать и помечаем прочитанным
        const timer = setTimeout(markRead, 200);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, messages.length]);

    // компенсация скролла при пагинации: до рендера новых событий запоминаем
    // scrollHeight/scrollTop, после — компенсируем прирост высоты
    useLayoutEffect(() => {
        const el = messagesRef.current;
        if (!el) return;

        const anchor = scrollAnchorRef.current;
        if (anchor && el.scrollHeight > anchor.scrollHeight) {
            el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
            scrollAnchorRef.current = null;
        }
    }, [messages.length]);

    // автозаполнение: если лента не заполняет вьюпорт,
    // onScroll не сработает никогда — грузим историю сами,
    // пока не появится прокрутка или не исчерпается история
    useEffect(() => {
        if (!room || historyLoading) return;

        const el = messagesRef.current;
        if (!el) return;

        // уже есть прокрутка и мы не у верха — не мешаем юзеру
        if (
            el.scrollHeight > el.clientHeight &&
            el.scrollTop > SCROLL_LOAD_THRESHOLD
        ) {
            return;
        }

        loadMore(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, messages.length, historyLoading]);

    // скролл ленты: позиция (в хуке), прочтение и пагинация
    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;

        // доскроллили до низа — тоже помечаем прочитанным
        if (updateScrollPosition(el)) {
            markRead();
        }

        // пагинация: дотянули до верха — тянем историю
        if (el.scrollTop <= SCROLL_LOAD_THRESHOLD) {
            loadMore(true);
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

    const handleTextChange = (value: string) => {
        setText(value);

        if (value.trim() === '') {
            // поле опустело — перестаем «печатать»
            lastTypingSentRef.current = 0;
            client.sendTyping(roomId, false, TYPING_TIMEOUT).catch((error) => {
                console.error('Failed to send typing state:', error);
            });
            return;
        }

        const now = Date.now();
        if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL) return;

        lastTypingSentRef.current = now;
        client.sendTyping(roomId, true, TYPING_TIMEOUT).catch((error) => {
            console.error('Failed to send typing state:', error);
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;

        setText('');
        lastTypingSentRef.current = 0;
        client.sendTyping(roomId, false, TYPING_TIMEOUT).catch(() => {});

        // юзер сам пишет — хочет видеть своё сообщение:
        // разрешаем автоскролл, даже если читал историю выше
        forceScrollToBottom();
        try {
            await client.sendTextMessage(roomId, value);
        } catch (error) {
            console.error('Failed to send message:', error);
            setText(value);
        }
    };

    const memberCount = room.getJoinedMemberCount();

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <button
                    className={styles.backButton}
                    onClick={() => navigate('/chats')}
                    aria-label="Назад к списку чатов"
                >
                    ←
                </button>
                <Avatar room={room} size={40} />
                <div className={styles.headerInfo}>
                    <div className={styles.headerName}>
                        {room.name}
                        {room.hasEncryptionStateEvent() && (
                            <span className={styles.encryptionIcon} title="Сквозное шифрование">🔒</span>
                        )}
                    </div>
                    <div className={styles.headerStatus}>
                        {typingStatus ?? `${memberCount} участн.`}
                    </div>
                </div>
            </header>

            <div
                className={styles.messages}
                ref={messagesRef}
                onScroll={handleScroll}
            >
                {historyLoading && (
                    <div className={styles.historyLoader}>Загрузка истории…</div>
                )}
                {messages.map((event) => (
                    <MessageBubble
                        key={event.getId()}
                        event={event}
                        room={room}
                        isOwn={event.getSender() === client.getUserId()}
                    />
                ))}
                <div ref={bottomRef} />
            </div>

            <form className={styles.inputRow} onSubmit={handleSubmit}>
                <input
                    className={styles.input}
                    type="text"
                    placeholder="Написать сообщение…"
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    autoFocus
                />
                <button
                    className={styles.sendButton}
                    type="submit"
                    disabled={!text.trim()}
                    aria-label="Отправить"
                >
                    →
                </button>
            </form>
        </div>
    );
};

export default ChatView;
