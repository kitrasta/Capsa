import { useParams } from 'react-router-dom';
import ChatView from '../widgets/Chat/ChatView';
import styles from './ChatsPage.module.css';

const ChatsPage = () => {
    const { roomId } = useParams();

    if (!roomId) {
        return (
            <div className={styles.wrapper}>
                <div className={styles.empty}>
                    <h2 className={styles.emptyTitle}>Capsa</h2>
                    <p className={styles.emptyText}>
                        Выберите чат, чтобы начать переписку
                    </p>
                </div>
            </div>
        );
    }

    return <ChatView key={roomId} roomId={roomId} />;
};

export default ChatsPage;
