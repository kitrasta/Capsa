import styles from './SearchBar.module.css';

import { Search } from 'lucide-react';

import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';

interface Props {
    searchTerm: string;
    onSearchTernChange: (value: string) => void;
    results: IPublicRoomsChunkRoom[];
    loading: boolean;
}

const SearchBar = () => {




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
                        const value = e.target.value;
                        setSearchTerm(value);
                        if (value === ''){
                            setResults([])
                        }
                    }}
                />
            </div>

            {loading && <span>Loading...</span>}
            {results.map((room) => (
                <div key={room.room_id} className={styles.result}>
                    <span>{room.name}</span>
                    <span className={styles.members}>
                        {room.num_joined_members}
                    </span>
                </div>
            ))}

        </div>


    )

}

export default SearchBar;