import { memo } from 'react';
import styles from './RoomListItem.module.css';
import type { RoomListItemView } from './hooks/useRoomListItem';

export interface Props extends RoomListItemView {
    avatarSrc: string | null;
    isActive: boolean;
    onClick: (roomId: string) => void;
}

const AVATAR_SIZE = 48;

const formatActivityTime = (ts: number): string => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
        return date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Вчера';

    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
    });
};

const RoomListItem = memo(
    ({
        roomId,
        name,
        avatarSrc,
        lastMessage,
        unread,
        hasUnread,
        isMe,
        isActive,
        lastActivityTs,
        onClick,
    }: Props) => (
        <button
            type="button"
            className={`${styles.room} ${isActive ? styles.active : ''}`}
            onClick={() => onClick(roomId)}
            aria-current={isActive ? 'page' : undefined}
        >
            {avatarSrc ? (
                <img
                    className={styles.avatar}
                    src={avatarSrc}
                    alt=""
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                />
            ) : (
                <span
                    className={`${styles.avatar} ${styles.avatarFallback}`}
                    aria-hidden="true"
                >
                    {(name || '?').charAt(0).toUpperCase()}
                </span>
            )}

            <span className={styles.info}>
                <span className={styles.topLine}>
                    <span className={`${styles.name} ${hasUnread ? styles.nameUnread : ''}`}>
                        {name}
                    </span>
                    <time className={styles.time}>{formatActivityTime(lastActivityTs)}</time>
                </span>

                <span className={styles.bottomLine}>
                    <span className={styles.lastMessage}>
                        {lastMessage && (
                            <>
                                <span className={styles.sender}>
                                    {isMe ? 'Вы' : lastMessage.senderName}:
                                </span>{' '}
                                <span className={styles.text}>{lastMessage.text}</span>
                            </>
                        )}
                    </span>
                    {hasUnread && (
                        <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>
                    )}
                </span>
            </span>
        </button>
    ),
);

RoomListItem.displayName = 'RoomListItem';

export default RoomListItem;
