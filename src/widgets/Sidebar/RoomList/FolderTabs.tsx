import type { SpaceFolderFilter } from './useSpaceFolders';
import styles from './SpaceFolders.module.css';

interface Props {
    filter: SpaceFolderFilter;
    onFilterChange: (filter: SpaceFolderFilter) => void;
}

const filters: { value: SpaceFolderFilter; label: string }[] = [
    { value: 'all', label: 'Все' },
    { value: 'unread', label: 'Новые' },
    { value: 'direct', label: 'Личные' },
];

const FolderTabs = ({ filter, onFilterChange }: Props) => (
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
    </div>
);

export default FolderTabs;
