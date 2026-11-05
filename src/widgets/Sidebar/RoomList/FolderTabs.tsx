import type { Room } from 'matrix-js-sdk';
import type { SpaceFolderFilter } from './useSpaceFolders';
import styles from './SpaceFolders.module.css';

interface Props {
    filter: SpaceFolderFilter;
    path: Room[];
    onFilterChange: (filter: SpaceFolderFilter) => void;
    onOpenBreadcrumb: (index: number) => void;
    onShowAll: () => void;
}

const filters: { value: SpaceFolderFilter; label: string }[] = [
    { value: 'all', label: 'Все' },
    { value: 'unread', label: 'Новые' },
    { value: 'direct', label: 'Личные' },
];

const FolderTabs = ({
    filter,
    path,
    onFilterChange,
    onOpenBreadcrumb,
    onShowAll,
}: Props) => (
    <div className={styles.navigation}>
        <div className={styles.tabs} role="group" aria-label="Фильтры чатов">
            {filters.map((item) => (
                <button
                    className={`${styles.tab} ${filter === item.value ? styles.tabActive : ''}`}
                    type="button"
                    key={item.value}
                    aria-pressed={filter === item.value}
                    onClick={() => onFilterChange(item.value)}
                >
                    {item.label}
                </button>
            ))}
        </div>

        {path.length > 0 && (
            <nav className={styles.breadcrumbs} aria-label="Путь">
                <span className={styles.breadcrumbItem}>
                    <button type="button" className={styles.breadcrumb} onClick={onShowAll}>
                        Все
                    </button>
                </span>
                {path.map((space, index) => (
                    <span className={styles.breadcrumbItem} key={space.roomId}>
                        <span className={styles.separator}>/</span>
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
