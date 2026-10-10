import { useEffect, useState } from 'react';
import {
    Boxes,
    Loader2,
    MessageSquare,
    Users,
    Megaphone,
    X,
} from 'lucide-react';
import Modal from '../../shared/ui/Modal/Modal';
import {
    createSpace,
    createGroup,
    createChannel,
    searchUsers,
    type UserSearchResult,
} from '../../shared/lib/matrix/client';
import styles from './CreateChatModal.module.css';

interface CreateChatModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Mode = null | 'space' | 'group' | 'channel';

const chatTypes = [
    { id: 'direct', label: 'Личный чат', description: 'Общение один на один', icon: MessageSquare },
    { id: 'group', label: 'Группа', description: 'Общение с несколькими людьми', icon: Users },
    { id: 'channel', label: 'Канал', description: 'Трансляция для подписчиков', icon: Megaphone },
    { id: 'space', label: 'Пространство', description: 'Папка для чатов и групп', icon: Boxes },
];

const CreateChatModal = ({ isOpen, onClose }: CreateChatModalProps) => {
    const [mode, setMode] = useState<Mode>(null);

    // общие для всех форм
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    // группа: шаг «название» → шаг «участники»
    const [groupStep, setGroupStep] = useState<'name' | 'members'>('name');
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [selectedUsers, setSelectedUsers] = useState<UserSearchResult[]>([]);

    // канал: описание
    const [topic, setTopic] = useState('');

    const resetAll = () => {
        setMode(null);
        setName('');
        setError(null);
        setIsCreating(false);
        setGroupStep('name');
        setSearchTerm('');
        setSearchResults([]);
        setSelectedUsers([]);
        setTopic('');
    };

    const closeModal = () => {
        resetAll();
        onClose();
    };

    // поиск участников группы с debounce 400мс
    useEffect(() => {
        if (mode !== 'group' || groupStep !== 'members') return;

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
    }, [searchTerm, mode, groupStep]);

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
            if (mode === 'space') {
                await createSpace(trimmedName);
            } else if (mode === 'group') {
                await createGroup(
                    trimmedName,
                    selectedUsers.map((u) => u.userId),
                );
            } else if (mode === 'channel') {
                await createChannel(trimmedName, topic.trim() || undefined);
            } else {
                return;
            }
            closeModal();
        } catch (createError) {
            console.error('Failed to create:', createError);
            const label =
                mode === 'space' ? 'пространство' : mode === 'group' ? 'группу' : 'канал';
            setError(`Не удалось создать ${label}`);
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

    const renderTypes = () => (
        <div className={styles.list}>
            {chatTypes.map(({ id, label, description, icon: Icon }) => (
                <button
                    key={id}
                    className={styles.option}
                    onClick={() => {
                        if (id === 'direct') {
                            closeModal();
                            return;
                        }
                        setMode(id as Exclude<Mode, null>);
                    }}
                >
                    <div className={styles.iconWrapper}>
                        <Icon size={20} />
                    </div>
                    <div className={styles.text}>
                        <span className={styles.label}>{label}</span>
                        <span className={styles.description}>{description}</span>
                    </div>
                </button>
            ))}
        </div>
    );

    const renderSpaceForm = () => (
        <form className={styles.form} onSubmit={handleCreate}>
            <input
                className={styles.input}
                type="text"
                placeholder="Название пространства"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
            />
            <button
                className={styles.submitButton}
                type="submit"
                disabled={!name.trim() || isCreating}
            >
                {isCreating ? <Loader2 className={styles.spinner} size={18} /> : 'Создать'}
            </button>
            {error && <p className={styles.error}>{error}</p>}
        </form>
    );

    const renderGroupNameForm = () => (
        <form className={styles.form} onSubmit={handleGroupNext}>
            <input
                className={styles.input}
                type="text"
                placeholder="Название группы"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
            />
            <button className={styles.submitButton} type="submit" disabled={!name.trim()}>
                Далее
            </button>
            {error && <p className={styles.error}>{error}</p>}
        </form>
    );

    const renderGroupMembersForm = () => (
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

    const renderChannelForm = () => (
        <form className={styles.form} onSubmit={handleCreate}>
            <input
                className={styles.input}
                type="text"
                placeholder="Название канала"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
            />
            <textarea
                className={`${styles.input} ${styles.textarea}`}
                placeholder="Описание (необязательно)"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
            />
            <button
                className={styles.submitButton}
                type="submit"
                disabled={!name.trim() || isCreating}
            >
                {isCreating ? <Loader2 className={styles.spinner} size={18} /> : 'Создать канал'}
            </button>
            {error && <p className={styles.error}>{error}</p>}
        </form>
    );

    return (
        <Modal isOpen={isOpen} onClose={closeModal} title="Новый чат">
            {mode === null && renderTypes()}
            {mode === 'space' && renderSpaceForm()}
            {mode === 'group' &&
                (groupStep === 'name' ? renderGroupNameForm() : renderGroupMembersForm())}
            {mode === 'channel' && renderChannelForm()}
        </Modal>
    );
};

export default CreateChatModal;
