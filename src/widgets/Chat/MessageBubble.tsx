import type { MatrixEvent, Room } from 'matrix-js-sdk';
import styles from './MessageBubble.module.css';

interface Props {
    event: MatrixEvent;
    room: Room;
    isOwn: boolean;
}

const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });

const MessageBubble = ({ event, room, isOwn }: Props) => {
    const body = event.getContent<{ body?: string }>().body ?? '';
    const senderId = event.getSender() ?? '';
    const senderName = room.currentState.getMember(senderId)?.name ?? senderId;
    const ts = event.getTs();

    return (
        <div className={`${styles.message} ${isOwn ? styles.own : ''}`}>
            {!isOwn && (
                <div className={styles.senderName}>{senderName}</div>
            )}
            <div className={styles.bubble}>
                <div className={styles.text}>{body}</div>
                <div className={styles.time}>
                    {formatTime(ts)}
                    {isOwn && <span className={styles.status}>✓✓</span>}
                </div>
            </div>
        </div>
    );
};

export default MessageBubble;
