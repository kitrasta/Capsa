import { ChevronRight, Folder, FolderLock } from 'lucide-react';
import { useRoomListItemAvatar } from './hooks/useRoomListItemAvatar';
import type { SpaceFolderSpaceView } from './useSpaceFolders';
import styles from './SpaceFolders.module.css';

interface Props {
    space: SpaceFolderSpaceView;
    onOpen: (roomId: string) => void;
}

const AVATAR_SIZE = 36;

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
            <span className={styles.spaceName}>{space.name}</span>
            {!space.canOpen && <span className={styles.accessLabel}>Нет доступа</span>}
            {space.unread > 0 && (
                <span className={styles.spaceUnread}>{space.unread > 99 ? '99+' : space.unread}</span>
            )}
            {space.canOpen && <ChevronRight className={styles.spaceChevron} size={17} />}
        </button>
    );
};

export default SpaceRow;
