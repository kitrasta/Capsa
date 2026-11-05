import { Folder, FolderLock } from 'lucide-react';
import type { SpaceFolderSpaceView } from './useSpaceFolders';
import styles from './SpaceFolders.module.css';

interface Props {
    space: SpaceFolderSpaceView;
    onOpen: (roomId: string) => void;
}

const SpaceChildSpaceRow = ({ space, onOpen }: Props) => (
    <button
        className={`${styles.childSpace} ${space.canOpen ? '' : styles.childSpaceDisabled}`}
        type="button"
        disabled={!space.canOpen}
        onClick={() => onOpen(space.roomId)}
    >
        {space.canOpen ? <Folder size={20} /> : <FolderLock size={20} />}
        <span className={styles.childSpaceName}>{space.name}</span>
        {!space.canOpen && <span className={styles.accessLabel}>Нет доступа</span>}
    </button>
);

export default SpaceChildSpaceRow;
