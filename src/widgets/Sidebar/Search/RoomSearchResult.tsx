import { memo } from 'react';
import styles from './RoomSearchResult.module.css';

interface RoomSearchResultProps {
    roomId: string;
    name: string;
    membersCount: number;
    // стабильный обработчик: компонент сам передаёт свой id
    onClick: (roomId: string) => void;
}

// Чистовой компонент результата поиска комнат: только данные, без SDK-объектов
const RoomSearchResult = memo(({ roomId, name, membersCount, onClick }: RoomSearchResultProps) => (
    <button className={styles.result} onClick={() => onClick(roomId)}>
        <span>{name}</span>
        <span className={styles.members}>{membersCount}</span>
    </button>
));

RoomSearchResult.displayName = 'RoomSearchResult';

export default RoomSearchResult;
