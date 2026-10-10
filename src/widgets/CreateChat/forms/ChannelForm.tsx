import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createChannel } from '../../../shared/lib/matrix/client';
import styles from '../CreateChatModal.module.css';

interface ChannelFormProps {
    onDone: () => void;
}

const ChannelForm = ({ onDone }: ChannelFormProps) => {
    const [name, setName] = useState('');
    const [topic, setTopic] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || isCreating) return;

        setIsCreating(true);
        setError(null);
        try {
            await createChannel(trimmedName, topic.trim() || undefined);
            onDone();
        } catch (createError) {
            console.error('Failed to create channel:', createError);
            setError('Не удалось создать канал');
            setIsCreating(false);
        }
    };

    return (
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
};

export default ChannelForm;
