import styles from './SearchBar.module.css';
import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';
import { Search } from 'lucide-react';
import RoomSearchResult from './RoomSearchResult';
import UserSearchResult from './UserSearchResult';
import type { UserSearchResult as UserResult } from '../../../shared/lib/matrix/client';

interface Props {
    searchTerm: string;
    onSearchTermChange: (value: string) => void;
    results: IPublicRoomsChunkRoom[];
    users: UserResult[];
    loading: boolean;
    onRoomClick: (roomId: string) => void;
    onUserClick: (userId: string) => void;
}

const SearchBar = ({
    searchTerm,
    onSearchTermChange,
    results,
    users,
    loading,
    onRoomClick,
    onUserClick,
}: Props) => {
    const nothingFound =
        !loading && searchTerm !== '' && results.length === 0 && users.length === 0;

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

            {loading && <span className={styles.sectionTitle}>Поиск…</span>}

            {users.length > 0 && (
                <div className={styles.section}>
                    <span className={styles.sectionTitle}>Люди</span>
                    {users.map((user) => (
                        <UserSearchResult
                            key={user.userId}
                            userId={user.userId}
                            displayName={user.displayName}
                            onClick={() => onUserClick(user.userId)}
                        />
                    ))}
                </div>
            )}

            {results.length > 0 && (
                <div className={styles.section}>
                    <span className={styles.sectionTitle}>Комнаты</span>
                    {results.map((room) => (
                        <RoomSearchResult
                            key={room.room_id}
                            name={room.name ?? room.room_id}
                            membersCount={room.num_joined_members}
                            onClick={() => onRoomClick(room.room_id)}
                        />
                    ))}
                </div>
            )}

            {nothingFound && (
                <span className={styles.sectionTitle}>Ничего не найдено</span>
            )}
        </div>
    );
};

export default SearchBar;
