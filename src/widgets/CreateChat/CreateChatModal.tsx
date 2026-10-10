import { useEffect, useRef, useState } from 'react';
import {
    Boxes,
    Check,
    Loader2,
    MessageSquare,
    Users,
    Megaphone,
    X,
} from 'lucide-react';
import type { Room } from 'matrix-js-sdk';
import Modal from '../../shared/ui/Modal/Modal';
import {
    createSpace,
    createGroup,
    createChannel,
    addRoomToSpace,
    searchUsers,
    getClient,
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

    // пространство: шаг «название» → шаг «комнаты»
    const [spaceStep, setSpaceStep] = useState<'name' | 'rooms'>('name');
    const [roomFilter, setRoomFilter] = useState('');
    const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
    // пространство уже создано, но комнаты могли не доложиться:
    // повторный сабмит не должен плодить дубликаты пространства
    const createdSpaceIdRef = useRef<string | null>(null);
    const addedRoomIdsRef = useRef<Set<string>>(new Set());

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
        setSpaceStep('name');
        setRoomFilter('');
        setSelectedRooms([]);
        createdSpaceIdRef.current = null;
        addedRoomIdsRef.current.clear();
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

    // комнаты для выбора в пространство: только вступлённые и не пространства
    const myRooms = getClient()
        .getRooms()
        .filter(
            (room) => room.getMyMembership() === 'join' && !room.isSpaceRoom(),
        );

    const handleToggleRoom = (room: Room) => {
        setSelectedRooms((prev) =>
            prev.some((r) => r.roomId === room.roomId)
                ? prev.filter((r) => r.roomId !== room.roomId)
                : [...prev, room],
        );
    };

    // создание пространства: createSpace (если ещё нет) + докладка комнат
    const handleCreateSpace = async () => {
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;

        setIsCreating(true);
        setError(null);
        try {
            if (!createdSpaceIdRef.current) {
                createdSpaceIdRef.current = await createSpace(trimmedName);
            }
        } catch (createError) {
            console.error('Failed to create space:', createError);
            setError('Не удалось создать пространство');
            setIsCreating(false);
            return;
        }

        try {
            const spaceId = createdSpaceIdRef.current;
            // докладываем только те, что ещё не легли — for...of, строго последовательно
            for (const room of selectedRooms) {
                if (addedRoomIdsRef.current.has(room.roomId)) continue;
                await addRoomToSpace(spaceId, room.roomId);
                addedRoomIdsRef.current.add(room.roomId);
            }
            closeModal();
        } catch (addError) {
            console.error('Failed to add rooms to space:', addError);
            setError('Не удалось добавить комнаты в пространство');
            setIsCreating(false);
        }
    };

    const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;

        if (mode === 'space') {
            await handleCreateSpace();
            return;
        }

        setIsCreating(true);
        setError(null);
        try {
            if (mode === 'group') {
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
            const label = mode === 'group' ? 'группу' : 'канал';
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

    // шаг «название» пространства
    const handleSpaceNext = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!name.trim()) return;
        setSpaceStep('rooms');
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

    const renderSpaceNameForm = () => (
        <form className={styles.form} onSubmit={handleSpaceNext}>
            <input
                className={styles.input}
                type="text"
                placeholder="Название пространства"
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

    const renderSpaceRoomsForm = () => {
        const term = roomFilter.trim().toLowerCase();
        const filteredRooms = myRooms.filter((room) =>
            (room.name ?? '').toLowerCase().includes(term),
        );

        return (
            <form className={styles.form} onSubmit={handleCreate}>
                <input
                    className={styles.input}
                    type="text"
                    placeholder="Фильтр комнат"
                    value={roomFilter}
                    onChange={(event) => setRoomFilter(event.target.value)}
                />

                {filteredRooms.length > 0 && (
                    <div className={styles.searchList}>
                        {filteredRooms.map((room) => {
                            const selected = selectedRooms.some(
                                (r) => r.roomId === room.roomId,
                            );
                            return (
                                <button
                                    key={room.roomId}
                                    type="button"
                                    className={`${styles.searchRow} ${styles.roomRow} ${
                                        selected ? styles.searchRowSelected : ''
                                    }`}
                                    onClick={() => handleToggleRoom(room)}
                                >
                                    <span className={styles.searchName}>
                                        {room.name}
                                    </span>
                                    {selected && (
                                        <Check className={styles.checkIcon} size={16} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

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
    };

    const renderGroupForm = () => (
        <>
            {groupStep === 'name' ? (
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
            ) : (
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
            )}
        </>
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
            {mode === 'space' &&
                (spaceStep === 'name' ? renderSpaceNameForm() : renderSpaceRoomsForm())}
            {mode === 'group' && renderGroupForm()}
            {mode === 'channel' && renderChannelForm()}
        </Modal>
    );
};

export default CreateChatModal;
