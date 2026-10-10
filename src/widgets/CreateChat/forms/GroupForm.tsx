import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createGroup, searchUsers, type UserSearchResult } from '../../../shared/lib/matrix/client';
import styles from '../CreateChatModal.module.css';

interface GroupFormProps {
    onDone: () => void;
}

const GroupForm = ({ onDone }: GroupFormProps) => {
    const [groupStep, setGroupStep] = useState<'name' | 'members'>('name');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);

    // поиск участников группы с debounce 400мс
    useEffect(() => {
        if (groupStep !== 'members') return;

        const term = searchTerm.trim();
        if (term === '') return;

        const timer = setTimeout(async () => {
            try {
                setSearchResults(await searchUsers(term));
            } catch (searchError) {
                console.error('Error searching users:', searchError);
                setSearchResults([]);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [searchTerm, groupStep]);

    const handleSelectUser = (user: UserSearchResult) => {
        setSearchTerm('');
        setSearchResults([]);
        setSelectedUsers((prev) =>
            prev.some((u) => u.userId === user.userId) ? prev : [...prev, user],
        );
    };

    const handleRemoveUser = (userId: string) => {
        setSelectedUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;

        setIsCreating(true);
        setError(null);
        try {
            await createGroup(
                trimmedName,
                selectedUsers.map((u) => u.userId),
            );
            onDone();
        } catch (createError) {
            console.error('Failed to create group:', createError);
            setError('Не удалось создать группу');
            setIsCreating(false);
        }
    };

    // шаг «название» группы
    const handleGroupNext = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!name.trim()) return;
        setGroupStep('members');
        setError(null);
    };

    const renderNameForm = () => (
        <form className={styles.form} onSubmit={handleGroupNext}>
            <input
                className={styles.input}
                type="text"
                placeholder="Название группы"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
            />
            <button
                className={styles.submitButton}
                type="submit"
                disabled={!name.trim()}
            >
                Далее
            </button>
            {error && <p className={styles.error}>{error}</p>}
        </form>
    );

    const renderMembersForm = () => (
        <form className={styles.form} onSubmit={handleCreate}>
            {selectedUsers.length > 0 && (
                <div className={styles.chips}>
                    {selectedUsers.map((user) => (
                        <span key={user.userId} className={styles.chip}>
                            {user.displayName ?? user.userId}
                            <button
                                type="button"
                                className={styles.chipRemove}
                                onClick={() => handleRemoveUser(user.userId)}
                                aria-label={`Убрать ${user.displayName ?? user.userId}`}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <input
                className={styles.input}
                type="text"
                placeholder="Поиск участников"
                value={searchTerm}
                onChange={(event) => {
                    const value = event.target.value;
                    setSearchTerm(value);
                    if (value.trim() === '') {
                        setSearchResults([]);
                    }
                }}
            />

            {searchResults.length > 0 && (
                <div className={styles.searchList}>
                    {searchResults.map((user) => (
                        <button
                            key={user.userId}
                            type="button"
                            className={styles.searchRow}
                            onClick={() => handleSelectUser(user)}
                        >
                            <span className={styles.searchName}>
                                {user.displayName ?? user.userId}
                            </span>
                            <span className={styles.searchId}>{user.userId}</span>
                        </button>
                    ))}
                </div>
            )}

            <button
                className={styles.submitButton}
                type="submit"
                disabled={!name.trim() || isCreating}
            >
                {isCreating ? (
                    <Loader2 className={styles.spinner} size={18} />
                ) : (
                    'Создать группу'
                )}
            </button>
            {error && <p className={styles.error}>{error}</p>}
        </form>
    );

    return (
        <>
            {groupStep === 'name' ? renderNameForm() : renderMembersForm()}
        </>
    );
};

export default GroupForm;
