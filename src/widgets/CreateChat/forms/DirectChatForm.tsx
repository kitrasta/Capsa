import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createDirectChat, searchUsers, type UserSearchResult } from '../../../shared/lib/matrix';
import styles from '../CreateChatModal.module.css';

interface DirectChatFormProps {
    onDone: (roomId: string) => void;
}

const DirectChatForm = ({ onDone }: DirectChatFormProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const searchVersionRef = useRef(0);

    useEffect(() => {
        const version = ++searchVersionRef.current;
        const term = searchTerm.trim();
        if (term === '') return;

        const timer = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchUsers(term);
                if (version !== searchVersionRef.current) return;
                setSearchResults(results);
                setError(null);
            } catch (searchError) {
                if (version !== searchVersionRef.current) return;
                console.error('Error searching users:', searchError);
                setSearchResults([]);
                setError('Не удалось найти пользователей');
            } finally {
                if (version === searchVersionRef.current) {
                    setIsSearching(false);
                }
            }
        }, 400);

        return () => {
            clearTimeout(timer);
            searchVersionRef.current += 1;
        };
    }, [searchTerm]);

    const handleOpenChat = async (user: UserSearchResult) => {
        if (creatingUserId) return;

        setCreatingUserId(user.userId);
        setError(null);
        try {
            const roomId = await createDirectChat(user.userId);
            onDone(roomId);
        } catch (createError) {
            console.error('Failed to open direct chat:', createError);
            setError('Не удалось открыть личный чат');
            setCreatingUserId(null);
        }
    };

    const term = searchTerm.trim();

    return (
        <div className={styles.form}>
            <input
                className={styles.input}
                type="text"
                placeholder="Найти пользователя"
                value={searchTerm}
                onChange={(event) => {
                    const value = event.target.value;
                    searchVersionRef.current += 1;
                    setSearchTerm(value);
                    setError(null);
                    if (value.trim() === '') {
                        setSearchResults([]);
                        setIsSearching(false);
                    }
                }}
                disabled={creatingUserId !== null}
                autoFocus
            />

            {isSearching && <span className={styles.description}>Поиск…</span>}

            {searchResults.length > 0 && (
                <div className={styles.searchList}>
                    {searchResults.map((user) => {
                        const displayName = user.displayName ?? user.userId;
                        const isCreating = creatingUserId === user.userId;
                        return (
                            <button
                                key={user.userId}
                                type="button"
                                className={`${styles.searchRow} ${styles.roomRow}`}
                                onClick={() => handleOpenChat(user)}
                                disabled={creatingUserId !== null}
                                aria-label={`Открыть чат с ${displayName}`}
                            >
                                <span className={styles.text}>
                                    <span className={styles.searchName}>{displayName}</span>
                                    <span className={styles.searchId}>{user.userId}</span>
                                </span>
                                {isCreating && <Loader2 className={styles.spinner} size={18} />}
                            </button>
                        );
                    })}
                </div>
            )}

            {!isSearching && term !== '' && searchResults.length === 0 && !error && (
                <span className={styles.description}>Ничего не найдено</span>
            )}
            {error && <p className={styles.error}>{error}</p>}
        </div>
    );
};

export default DirectChatForm;
