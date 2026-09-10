import styles from './RoomSearchResult.module.css'

interface RoomSearchResultProps {
    name: string;
    membersCount: number;
    onClick: () => void;
}

const RoomSearchResult = ({name, membersCount, onClick}: RoomSearchResultProps) => {
    return (

                <button
                className={styles.result}
                onClick={onClick}>

                    <span>{name}</span>
                    <span className={styles.members}>{membersCount}</span>

                </button>
    )
}

export default RoomSearchResult