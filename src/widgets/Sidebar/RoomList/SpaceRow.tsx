import { ChevronRight, Folder, FolderLock } from 'lucide-react';
import { useRoomListItemAvatar } from './hooks/useRoomListItemAvatar';
import type { SpaceFolderSpaceView } from './useSpaceFolders';
import styles from './SpaceFolders.module.css';

interface Props {
    space: SpaceFolderSpaceView;
    onOpen: (roomId: string) => void;
}

const AVATAR_SIZE = 48;

const formatRoomCount = (count: number): string => {
    const lastTwo = count % 100;
    const last = count % 10;
    if (lastTwo >= 11 && lastTwo <= 14) return `${count} комнат`;
    if (last === 1) return `${count} комната`;
    if (last >= 2 && last <= 4) return `${count} комнаты`;
    return `${count} комнат`;
};

const SpaceRow = ({ space, onOpen }: Props) => {
    const avatarSrc = useRoomListItemAvatar(space.avatarUrl, AVATAR_SIZE);

    return (
        <button
            className={`${styles.spaceRow} ${space.canOpen ? '' : styles.spaceRowDisabled}`}
            type="button"
            disabled={!space.canOpen}
            aria-label={`${space.name}${space.unread > 0 ? ` ${space.unread > 99 ? '99+' : space.unread}` : ''}${space.canOpen ? '' : ' Нет доступа'}`}
            onClick={() => onOpen(space.roomId)}
        >
            {avatarSrc ? (
                <img
                    className={styles.spaceAvatar}
                    src={avatarSrc}
                    alt=""
                    width={AVATAR_SIZE}
                    height={AVATAR_SIZE}
                />
            ) : (
                <span className={styles.spaceAvatarFallback} aria-hidden="true">
                    {space.canOpen ? <Folder size={20} /> : <FolderLock size={20} />}
                </span>
            )}
            <span className={styles.spaceInfo}>
                <span className={styles.spaceName}>{space.name}</span>
                <span className={styles.spaceChildCount}>{formatRoomCount(space.childCount)}</span>
            </span>
            {!space.canOpen && <span className={styles.accessLabel}>Нет доступа</span>}
            {space.unread > 0 && (
                <span className={styles.spaceUnread}>{space.unread > 99 ? '99+' : space.unread}</span>
            )}
            {space.canOpen && <ChevronRight className={styles.spaceChevron} size={17} />}
        </button>
    );
};

export default SpaceRow;
