import styles from './SearchBar.module.css';
import type { IPublicRoomsChunkRoom} from 'matrix-js-sdk';
import { Search } from 'lucide-react';



interface Props {
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    results: IPublicRoomsChunkRoom[];
    loading: boolean;
}

interface Props {
    onRoomClick: (roomId: string) => void;
}

const SearchBar = ({searchTerm, onSearchTermChange, results, loading}: Props) => {




    return (
        <div className={styles.wrapper}>

            <div className={styles.inputRow}>
                <Search className={styles.icon} size={20} />
                <input
                    className={styles.input}
                    type="text"
                    placeholder='Search'
                    value={searchTerm}
                    onChange={(e) => {
                        onSearchTermChange(e.target.value)
                    }}
                />
            </div>

            {loading && <span>Loading...</span>}
            {results.map((room) => (
                <button
                key={room.room_id} 
                className={styles.result}
                onClick={() => onRoomClick(room.room_id)}>

                    <span>{room.name}</span>
                    <span className={styles.members}>{room.num_joined_members}</span>

                </button>
                
            ))}

        </div>


    )

}

export default SearchBar;