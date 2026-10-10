import { useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { Room } from 'matrix-js-sdk';
import { createSpace, addRoomToSpace, getClient } from '../../../shared/lib/matrix/client';
import styles from '../CreateChatModal.module.css';

interface SpaceFormProps {
    onDone: () => void;
}

const SpaceForm = ({ onDone }: SpaceFormProps) => {
    const [spaceStep, setSpaceStep] = useState<'name' | 'rooms'>('name');
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [roomFilter, setRoomFilter] = useState('');
    const [selectedRooms, setSelectedRooms] = useState<Room[]>([]);
    // пространство уже создано, но комнаты могли не доложиться:
    // повторный сабмит не должен плодить дубликаты пространства
    const createdSpaceIdRef = useRef<string | null>(null);
    const addedRoomIdsRef = useRef<Set<string>>(new Set());

    // комнаты для выбора в пространство: только вступлённые и не пространства
    // фиксируется при каждом открытии формы — живой sync во время выбора не нужен
    const myRooms = useMemo(
        () =>
            getClient()
                .getRooms()
                .filter(
                    (room) => room.getMyMembership() === 'join' && !room.isSpaceRoom(),
                ),
        [],
    );

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
            onDone();
        } catch (addError) {
            console.error('Failed to add rooms to space:', addError);
            setError('Не удалось добавить комнаты в пространство');
            setIsCreating(false);
        }
    };

    const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;

        if (spaceStep === 'rooms') {
            handleCreateSpace();
            return;
        }
    };

    // шаг «название» пространства
    const handleSpaceNext = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!name.trim()) return;
        setSpaceStep('rooms');
        setError(null);
    };

    const handleToggleRoom = (room: Room) => {
        setSelectedRooms((prev) =>
            prev.some((r) => r.roomId === room.roomId)
                ? prev.filter((r) => r.roomId !== room.roomId)
                : [...prev, room],
        );
    };

    const renderNameForm = () => (
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

    const renderRoomsForm = () => {
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

    return (
        <>
            {spaceStep === 'name' ? renderNameForm() : renderRoomsForm()}
        </>
    );
};

export default SpaceForm;
