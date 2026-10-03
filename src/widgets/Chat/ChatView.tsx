import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomEvent } from 'matrix-js-sdk';
import { getClient } from '../../shared/lib/matrix/client';
import Avatar from '../Sidebar/RoomList/Avatar';
import MessageBubble from './MessageBubble';
import styles from './ChatView.module.css';

interface Props {
    roomId: string;
}

const ChatView = ({ roomId }: Props) => {
    const navigate = useNavigate();
    const client = getClient();
    const room = client.getRoom(roomId);

    const [text, setText] = useState('');
    const [timelineVersion, setTimelineVersion] = useState(0);
    const bottomRef = useRef<HTMLDivElement>(null);

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

    // автоскролл вниз при новых сообщениях
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages.length, roomId]);

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

            <div className={styles.messages}>
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
