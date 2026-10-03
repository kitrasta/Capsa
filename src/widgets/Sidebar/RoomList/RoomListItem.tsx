import styles from './RoomListItem.module.css';
import type { Room, MatrixClient } from 'matrix-js-sdk';
import Avatar from './Avatar';

interface Props {
    room: Room;
    client: MatrixClient;
}

const AVATAR_SIZE = 40;

const getLastMessagePreview = (room: Room): { sender: string; text: string } | null => {
    const event = room.getLastLiveEvent();
    if (!event) return null;

    const senderId = event.getSender() ?? '';
    const sender = room.currentState.getMember(senderId)?.name ?? senderId;

    if (event.getType() === 'm.room.message') {
        const body = event.getContent<{ body?: string }>().body;
        if (!body) return null;
        return { sender, text: body };
    }

    if (event.getType() === 'm.room.member') {
        return { sender, text: 'обновил(а) профиль' };
    }

    return null;
};

const RoomListItem = ({ room, client }: Props) => {
    const lastMessage = getLastMessagePreview(room);
    const isMe = lastMessage?.sender === client.getUserId();

    return (
        <div className={styles.room}>
            <Avatar room={room} size={AVATAR_SIZE} />

            <div className={styles.info}>
                <div className={styles.name}>{room.name}</div>
                {lastMessage && (
                    <div className={styles.lastMessage}>
                        <span className={styles.sender}>{isMe ? 'Вы' : lastMessage.sender}:</span>{' '}
                        <span className={styles.text}>{lastMessage.text}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoomListItem;
