import styles from './SearchBar.module.css';
import type { IPublicRoomsChunkRoom} from 'matrix-js-sdk';
import { Search } from 'lucide-react';
import RoomSearchResult from './RoomSearchResult'




interface Props {
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    results: IPublicRoomsChunkRoom[];
    loading: boolean;
    onRoomClick: (roomId: string) => void;
}

const SearchBar = ({searchTerm, onSearchTermChange, results, loading, onRoomClick}: Props) => {




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
                key={room.room_id}
                name={room.name ?? room.room_id}
                membersCount={room.num_joined_members}
                onClick={() => onRoomClick(room.room_id)}
                
            ))}

        </div>


    )

}

export default SearchBar;