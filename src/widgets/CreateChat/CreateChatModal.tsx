import { useState } from 'react';
import { Boxes, Loader2, MessageSquare, Users, Megaphone } from 'lucide-react';
import Modal from '../../shared/ui/Modal/Modal';
import { createSpace } from '../../shared/lib/matrix/client';
import styles from './CreateChatModal.module.css';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const chatTypes = [
  { id: 'direct', label: 'Личный чат', description: 'Общение один на один', icon: MessageSquare },
  { id: 'group', label: 'Группа', description: 'Общение с несколькими людьми', icon: Users },
  { id: 'channel', label: 'Канал', description: 'Трансляция для подписчиков', icon: Megaphone },
  { id: 'space', label: 'Пространство', description: 'Папка для чатов и групп', icon: Boxes },
];

const CreateChatModal = ({ isOpen, onClose }: CreateChatModalProps) => {
  const [isSpaceForm, setIsSpaceForm] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const closeModal = () => {
    setIsSpaceForm(false);
    setSpaceName('');
    setError(null);
    setIsCreating(false);
    onClose();
  };

  const handleCreateSpace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = spaceName.trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      await createSpace(name);
      closeModal();
    } catch (createError) {
      console.error('Failed to create space:', createError);
      setError('Не удалось создать пространство');
      setIsCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title="Новый чат">
      {isSpaceForm ? (
        <form className={styles.form} onSubmit={handleCreateSpace}>
          <input
            className={styles.input}
            type="text"
            placeholder="Название пространства"
            value={spaceName}
            onChange={(event) => setSpaceName(event.target.value)}
            autoFocus
          />
          <button
            className={styles.submitButton}
            type="submit"
            disabled={!spaceName.trim() || isCreating}
          >
            {isCreating ? <Loader2 className={styles.spinner} size={18} /> : 'Создать'}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      ) : (
        <div className={styles.list}>
          {chatTypes.map(({ id, label, description, icon: Icon }) => (
            <button
              key={id}
              className={styles.option}
              onClick={() => {
                if (id === 'space') {
                  setIsSpaceForm(true);
                  return;
                }
                onClose();
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
      )}
    </Modal>
  );
};

export default CreateChatModal;
