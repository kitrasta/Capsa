import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClientEvent, RoomEvent, RoomMemberEvent, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient } from '../../shared/lib/matrix/client';
import Avatar from '../Sidebar/RoomList/Avatar';
import MessageBubble from './MessageBubble';
import styles from './ChatView.module.css';

interface Props {
    roomId: string;
}

const SCROLLBACK_PAGE = 40;
const SCROLL_LOAD_THRESHOLD = 100; // px от верха, когда тянем историю
// отправка статуса печати: не чаще раза в 10 c,
// сервер держит его 20 c, чтобы пережить сетевые лаги
const TYPING_SEND_INTERVAL = 10_000;
const TYPING_TIMEOUT = 20_000;

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
    const [typingNames, setTypingNames] = useState<string[]>([]);
    const messagesRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const isLoadingHistoryRef = useRef(false);
    const wasAtBottomRef = useRef(true);
    // история исчерпана: дальше верха ничего нет
    const historyExhaustedRef = useRef(false);
    // позиция до подгрузки: {scrollHeight, scrollTop}
    const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
    // отправка статуса печати: не чаще раза в 10 c,
    // сервер держит его 20 c, чтобы пережить сетевые лаги
    const lastTypingSentRef = useRef(0);

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

    // зашифрованные события расшифровываются асинхронно:
    // событие приходит как m.room.encrypted, а после расшифровки
    // меняет тип на m.room.message и эмитит Event.decrypted
    useEffect(() => {
        if (!room) return;

        const handleDecrypted = (event: { getRoomId?: () => string | undefined }) => {
            if (event.getRoomId?.() === roomId) {
                setTimelineVersion((v) => v + 1);
            }
        };

        client.on(MatrixEventEvent.Decrypted, handleDecrypted);
        return () => {
            client.off(MatrixEventEvent.Decrypted, handleDecrypted);
        };
    }, [client, room, roomId]);

    // typing-индикатор: SDK разбирает m.typing ephemeral-события
    // и помечает участников, клиент ре-эмитит RoomMemberEvent.Typing
    useEffect(() => {
        if (!room) return;

        const myUserId = client.getUserId();
        const readTyping = () => {
            const names = room
                .getMembers()
                .filter(
                    (member) => member.typing && member.userId !== myUserId,
                )
                .map((member) => member.name);
            setTypingNames((prev) =>
                prev.length === names.length &&
                prev.every((name, i) => name === names[i])
                    ? prev
                    : names,
            );
        };

        const handleTyping = (_event: unknown, member: { roomId: string }) => {
            if (member.roomId === roomId) {
                readTyping();
            }
        };

        readTyping();
        client.on(RoomMemberEvent.Typing, handleTyping);
        return () => {
            client.off(RoomMemberEvent.Typing, handleTyping);
        };
    }, [client, room, roomId]);

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
        if (!room || !wasAtBottomRef.current) return;

        // даём автоскроллу отработать и помечаем прочитанным
        const timer = setTimeout(markRead, 200);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, messages.length]);

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

    // подгрузка истории: keepPosition — сохранять позицию чтения
    // (при доскролле до верха); при автозаполнении не нужно
    const loadHistory = (keepPosition: boolean) => {
        if (!room || isLoadingHistoryRef.current) return;

        // дошли до начала истории — дальше запросов нет
        if (room.oldState.paginationToken === null) {
            historyExhaustedRef.current = true;
            return;
        }
        if (historyExhaustedRef.current) return;

        if (keepPosition) {
            const el = messagesRef.current;
            if (el) {
                scrollAnchorRef.current = {
                    scrollHeight: el.scrollHeight,
                    scrollTop: el.scrollTop,
                };
            }
        }

        const eventsBefore = room.getLiveTimeline().getEvents().length;
        isLoadingHistoryRef.current = true;
        setLoadingHistory(true);
        client
            .scrollback(room, SCROLLBACK_PAGE)
            .then(() => {
                // история исчерпана, если у начала или событий
                // не прибавилось (защита от вечного цикла автозагрузки)
                const eventsAfter = room.getLiveTimeline().getEvents().length;
                if (
                    room.oldState.paginationToken === null ||
                    eventsAfter === eventsBefore
                ) {
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

    // автозаполнение: если лента не заполняет вьюпорт,
    // onScroll не сработает никогда — грузим историю сами,
    // пока не появится прокрутка или не исчерпается история
    useEffect(() => {
        if (!room || loadingHistory) return;

        const el = messagesRef.current;
        if (!el) return;

        // уже есть прокрутка и мы не у верха — не мешаем юзеру
        if (
            el.scrollHeight > el.clientHeight &&
            el.scrollTop > SCROLL_LOAD_THRESHOLD
        ) {
            return;
        }

        loadHistory(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, messages.length, loadingHistory]);

    // запоминаем, у края ли прокрутка
    const handleScroll = () => {
        const el = messagesRef.current;
        if (!el) return;

        const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        wasAtBottomRef.current = atBottom;

        // доскроллили до низа — тоже помечаем прочитанным
        if (atBottom) {
            markRead();
        }

        // пагинация: дотянули до верха — тянем историю
        if (el.scrollTop <= SCROLL_LOAD_THRESHOLD) {
            loadHistory(true);
        }
    };

    if (!room) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.empty}>Комната загружается…</div>
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
        wasAtBottomRef.current = true;
        try {
            await client.sendTextMessage(roomId, value);
        } catch (error) {
            console.error('Failed to send message:', error);
            setText(value);
        }
    };

    const memberCount = room.getJoinedMemberCount();

    const typingStatus =
        typingNames.length === 1
            ? `${typingNames[0]} печатает…`
            : typingNames.length === 2
              ? `${typingNames[0]} и ${typingNames[1]} печатают…`
              : typingNames.length > 2
                ? 'несколько человек печатают…'
                : null;

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
