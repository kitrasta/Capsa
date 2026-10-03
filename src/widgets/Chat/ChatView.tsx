import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientEvent, RoomEvent } from 'matrix-js-sdk';
import { getClient } from '../../shared/lib/matrix/client';
import Avatar from '../Sidebar/RoomList/Avatar';
import MessageBubble from './MessageBubble';
import styles from './ChatView.module.css';

interface Props {
    roomId: string;
}

const SCROLLBACK_PAGE = 40;
const SCROLL_LOAD_THRESHOLD = 100; // px от верха, когда тянем историю

const ChatView = ({ roomId }: Props) => {
    const navigate = useNavigate();
    const client = getClient();

    // комната может еще не быть в сторе (F5, sync не завершился) —
    // поэтому отслеживаем её появление реактивно
    const syncedRoom = useSyncExternalStore(
        (onChange) => {
            client.on(ClientEvent.Sync, onChange);
            client.on(ClientEvent.Room, onChange);
            return () => {
                client.off(ClientEvent.Sync, onChange);
                client.off(ClientEvent.Room, onChange);
            };
        },
        () => client.getRoom(roomId),
        () => undefined,
    );
    const room = syncedRoom;

    const [text, setText] = useState('');
    const [timelineVersion, setTimelineVersion] = useState(0);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const messagesRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const isLoadingHistoryRef = useRef(false);
    const wasAtBottomRef = useRef(true);
    // история исчерпана: дальше верха ничего нет
    const historyExhaustedRef = useRef(false);
    // позиция до подгрузки: {scrollHeight, scrollTop}
    const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

    // новые сообщения / локальные эхо — перерисовываем ленту
    useEffect(() => {
        if (!room) return;

        const handleTimeline = () => setTimelineVersion((v) => v + 1);

        room.on(RoomEvent.Timeline, handleTimeline);
        room.on(RoomEvent.LocalEchoUpdated, handleTimeline);
        return () => {
            room.off(RoomEvent.Timeline, handleTimeline);
            room.off(RoomEvent.LocalEchoUpdated, handleTimeline);
        };
    }, [room]);

    const messages = useMemo(() => {
        if (!room) return [];
        void timelineVersion; // перечитываем при смене версии
        return room
            .getLiveTimeline()
            .getEvents()
            .filter(
                (event) =>
                    !event.isRedacted() &&
                    event.getType() === 'm.room.message' &&
                    event.getContent<{ body?: string }>().body,
            );
    }, [room, timelineVersion]);

    // автоскролл вниз — только если юзер был у нижнего края
    useEffect(() => {
        if (wasAtBottomRef.current) {
            bottomRef.current?.scrollIntoView({ block: 'end' });
        }
    }, [messages.length, roomId]);

    // сохраняем позицию чтения при подгрузке истории сверху:
    // до рендера новых событий запоминаем scrollHeight/scrollTop,
    // после — компенсируем прирост высоты, чтобы юзер продолжал
    // видеть то же сообщение
    useLayoutEffect(() => {
        const el = messagesRef.current;
        if (!el) return;

        const anchor = scrollAnchorRef.current;
        if (anchor && el.scrollHeight > anchor.scrollHeight) {
            el.scrollTop = anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight);
            scrollAnchorRef.current = null;
        }
    }, [timelineVersion, messages.length]);

    // запоминаем, у края ли прокрутка
    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;

        const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        wasAtBottomRef.current = atBottom;

        // пагинация: дотянули до верха — тянем историю
        if (el.scrollTop > SCROLL_LOAD_THRESHOLD) return;
        if (isLoadingHistoryRef.current || !room) return;

        // дошли до начала истории — дальше запросов нет
        if (room.oldState.paginationToken === null) {
            historyExhaustedRef.current = true;
            return;
        }
        if (historyExhaustedRef.current) return;

        // фиксируем позицию чтения до подгрузки
        scrollAnchorRef.current = {
            scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop,
        };

        isLoadingHistoryRef.current = true;
        setLoadingHistory(true);
        client
            .scrollback(room, SCROLLBACK_PAGE)
            .then(() => {
                // scrollback мог вернуть меньше, чем просили:
                // если событий не прибавилось — история исчерпана
                if (room.oldState.paginationToken === null) {
                    historyExhaustedRef.current = true;
                }
            })
            .catch((error) => {
                console.error('Failed to load history:', error);
            })
            .finally(() => {
                isLoadingHistoryRef.current = false;
                setLoadingHistory(false);
                // если событий не пришло — сбрасываем якорь,
                // нечего компенсировать
                if (scrollAnchorRef.current &&
                    messagesRef.current?.scrollHeight === scrollAnchorRef.current.scrollHeight) {
                    scrollAnchorRef.current = null;
                }
            });
    };

    if (!room) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.empty}>Комната загружается…</div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;

        setText('');
        // юзер сам пишет — хочет видеть своё сообщение:
        // разрешаем автоскролл, даже если читал историю выше
        wasAtBottomRef.current = true;
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
                    <div className={styles.headerName}>{room.name}</div>
                    <div className={styles.headerStatus}>
                        {memberCount} участн.
                    </div>
                </div>
            </header>

            <div
                className={styles.messages}
                ref={messagesRef}
                onScroll={handleScroll}
            >
                {loadingHistory && (
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
                    onChange={(e) => setText(e.target.value)}
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
