import { useState } from 'react';
import { Boxes, MessageSquare, Users, Megaphone } from 'lucide-react';
import Modal from '../../shared/ui/Modal/Modal';
import SpaceForm from './forms/SpaceForm';
import GroupForm from './forms/GroupForm';
import ChannelForm from './forms/ChannelForm';
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

    // сброс стейта: формы размонтируются при mode → null и сбрасывают
    // свой внутренний стейт сами, поэтому здесь остаётся только режим
    const closeModal = () => {
        setMode(null);
        onClose();
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

    return (
        <Modal isOpen={isOpen} onClose={closeModal} title="Новый чат">
            {mode === null && renderTypes()}
            {mode === 'space' && <SpaceForm onDone={closeModal} />}
            {mode === 'group' && <GroupForm onDone={closeModal} />}
            {mode === 'channel' && <ChannelForm onDone={closeModal} />}
        </Modal>
    );
};

export default CreateChatModal;
