import styles from './RoomListItem.module.css';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import Avatar from './Avatar';

interface Props {
    room: Room;
    active?: boolean;
    onClick: (roomId: string) => void;
}

const AVATAR_SIZE = 40;

interface LastMessagePreview {
    senderId: string;
    senderName: string;
    text: string;
}

const getLastMessagePreview = (room: Room): LastMessagePreview | null => {
    const event = room.getLastLiveEvent();
    if (!event) return null;

    const senderId = event.getSender() ?? '';
    const senderName = room.currentState.getMember(senderId)?.name ?? senderId;

    if (event.getType() === 'm.room.message') {
        const body = event.getContent<{ body?: string }>().body;
        if (!body) return null;
        return { senderId, senderName, text: body };
    }

    if (event.getType() === 'm.room.member') {
        return { senderId, senderName, text: 'обновил(а) профиль' };
    }

    return null;
};

const RoomListItem = ({ room, active = false, onClick }: Props) => {
    const lastMessage = getLastMessagePreview(room);
    const isMe = lastMessage?.senderId === getClient().getUserId();

    return (
        <div
            className={`${styles.room} ${active ? styles.active : ''}`}
            onClick={() => onClick(room.roomId)}
        >
            <Avatar room={room} size={AVATAR_SIZE} />

            <div className={styles.info}>
                <div className={styles.name}>{room.name}</div>
                {lastMessage && (
                    <div className={styles.lastMessage}>
                        <span className={styles.sender}>
                            {isMe ? 'Вы' : lastMessage.senderName}:
                        </span>{' '}
                        <span className={styles.text}>{lastMessage.text}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoomListItem;
