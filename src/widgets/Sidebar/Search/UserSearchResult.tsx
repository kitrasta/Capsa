import { memo } from 'react';
import styles from './UserSearchResult.module.css';

interface UserSearchResultProps {
    userId: string;
    displayName?: string;
    // стабильный обработчик: компонент сам передаёт свой id,
    // чтобы не плодить инлайн-стрелки с новой identity на каждый рендер
    onClick: (userId: string) => void;
}

// Чистовой компонент результата поиска: только данные, без SDK-объектов
const UserSearchResult = memo(({ userId, displayName, onClick }: UserSearchResultProps) => {
    const label = displayName ?? userId;

    return (
        <button className={styles.result} onClick={() => onClick(userId)}>
            <div className={styles.info}>
                <span className={styles.name}>{label}</span>
                {displayName && <span className={styles.userId}>{userId}</span>}
            </div>
            <span className={styles.hint}>личный чат</span>
        </button>
    );
});

UserSearchResult.displayName = 'UserSearchResult';

export default UserSearchResult;
