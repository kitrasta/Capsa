import { memo } from 'react';
import styles from './RoomListItem.module.css';
import type { RoomListItemView } from './hooks/useRoomListItem';

export interface Props extends RoomListItemView {
    // скачанный аватар (object URL): даёт useRoomListItemAvatar снаружи,
    // чтобы компонент остался чистовым — без эффектов и SDK-объектов
    avatarSrc: string | null;
    isActive: boolean;
    onClick: (roomId: string) => void;
}

const AVATAR_SIZE = 40;

// Чистовой компонент одного элемента списка комнат: на вход — только снимок
// данных (RoomListItemView). React.memo пропускает ре-рендеры, пока снимок
// не изменился; обновления приходят из useRoomListItem (подписка на комнату).
const RoomListItem = memo(({ roomId, name, avatarSrc, lastMessage, unread, hasUnread, isMe, isActive, onClick }: Props) => (
    <div
        className={`${styles.room} ${isActive ? styles.active : ''}`}
        onClick={() => onClick(roomId)}
    >
        {avatarSrc ? (
            <img
                className={styles.avatar}
                src={avatarSrc}
                alt={name}
                width={AVATAR_SIZE}
                height={AVATAR_SIZE}
            />
        ) : (
            <div
                className={`${styles.avatar} ${styles.avatarFallback}`}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
            >
                {(name || '?').charAt(0).toUpperCase()}
            </div>
        )}

        <div className={styles.info}>
            <div className={`${styles.name} ${hasUnread ? styles.nameUnread : ''}`}>
                {name}
            </div>
            {lastMessage && (
                <div className={styles.lastMessage}>
                    <span className={styles.sender}>
                        {isMe ? 'Вы' : lastMessage.senderName}:
                    </span>{' '}
                    <span className={styles.text}>{lastMessage.text}</span>
                </div>
            )}
        </div>

        {hasUnread && (
            <span className={styles.badge}>
                {unread > 99 ? '99+' : unread}
            </span>
        )}
    </div>
));

RoomListItem.displayName = 'RoomListItem';

export default RoomListItem;
