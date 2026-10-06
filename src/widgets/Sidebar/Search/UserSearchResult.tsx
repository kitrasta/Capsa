import styles from './UserSearchResult.module.css';

interface UserSearchResultProps {
    userId: string;
    displayName?: string;
    onClick: () => void;
}

const UserSearchResult = ({ userId, displayName, onClick }: UserSearchResultProps) => {
    const label = displayName ?? userId;

    return (
        <button className={styles.result} onClick={onClick}>
            <div className={styles.info}>
                <span className={styles.name}>{label}</span>
                {displayName && <span className={styles.userId}>{userId}</span>}
            </div>
            <span className={styles.hint}>личный чат</span>
        </button>
    );
};

export default UserSearchResult;
