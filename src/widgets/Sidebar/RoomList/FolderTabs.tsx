import { Folder } from 'lucide-react';
import type { Room } from 'matrix-js-sdk';
import styles from './SpaceFolders.module.css';

interface Props {
    roots: Room[];
    path: Room[];
    unreadBySpace: ReadonlyMap<string, number>;
    onOpenRoot: (roomId: string) => void;
    onOpenBreadcrumb: (index: number) => void;
    onShowAll: () => void;
}

const FolderTabs = ({
    roots,
    path,
    unreadBySpace,
    onOpenRoot,
    onOpenBreadcrumb,
    onShowAll,
}: Props) => (
    <div className={styles.navigation}>
        <div className={styles.tabs} aria-label="Пространства">
            <button
                className={`${styles.tab} ${path.length === 0 ? styles.tabActive : ''}`}
                type="button"
                onClick={onShowAll}
            >
                Все
            </button>
            {roots.map((space) => {
                const unread = unreadBySpace.get(space.roomId) ?? 0;
                return (
                    <button
                        className={`${styles.tab} ${path[0]?.roomId === space.roomId ? styles.tabActive : ''}`}
                        type="button"
                        key={space.roomId}
                        onClick={() => onOpenRoot(space.roomId)}
                    >
                        <Folder size={14} />
                        <span className={styles.tabName}>{space.name}</span>
                        {unread > 0 && <span className={styles.unread}>{unread > 99 ? '99+' : unread}</span>}
                    </button>
                );
            })}
        </div>

        {path.length > 0 && (
            <nav className={styles.breadcrumbs} aria-label="Путь">
                {path.map((space, index) => (
                    <span className={styles.breadcrumbItem} key={space.roomId}>
                        {index > 0 && <span className={styles.separator}>/</span>}
                        <button
                            type="button"
                            className={styles.breadcrumb}
                            onClick={() => onOpenBreadcrumb(index)}
                            aria-current={index === path.length - 1 ? 'page' : undefined}
                        >
                            {space.name}
                        </button>
                    </span>
                ))}
            </nav>
        )}
    </div>
);

export default FolderTabs;
