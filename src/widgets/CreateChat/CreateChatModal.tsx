import { MessageSquare, Users, Megaphone } from 'lucide-react';
import Modal from '../../shared/ui/Modal/Modal';
import styles from './CreateChatModal.module.css';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const chatTypes = [
  { id: 'direct', label: 'Личный чат', description: 'Общение один на один', icon: MessageSquare },
  { id: 'group', label: 'Группа', description: 'Общение с несколькими людьми', icon: Users },
  { id: 'channel', label: 'Канал', description: 'Трансляция для подписчиков', icon: Megaphone },
];

const CreateChatModal = ({ isOpen, onClose }: CreateChatModalProps) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Новый чат">
      <div className={styles.list}>
        {chatTypes.map(({ id, label, description, icon: Icon }) => (
          <button 
            key={id} 
            className={styles.option}
            onClick={onClose}
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
    </Modal>
  );
};

export default CreateChatModal;