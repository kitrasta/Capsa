import styles from './Sidebar.module.css';
import Navbar from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';
import RoomList from './RoomList/RoomList';
import CreateChatModal from '../CreateChat/CreateChatModal';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { searchPublicRooms, joinRoom } from '../../shared/lib/matrix/client';
import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';

const Sidebar = () => {
    const { pathname } = useLocation();

    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<IPublicRoomsChunkRoom[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);

    useEffect(() => {
        if (searchTerm === '') return;

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const rooms = await searchPublicRooms(searchTerm);
                setResults(rooms);
            } catch (error) {
                console.error('Error searching public rooms:', error);
            } finally {
                setLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        if (value === '') {
            setResults([]);
        }
    };

    const handleRoomClick = async (roomId: string) => {
        try {
            await joinRoom(roomId);
            setSearchTerm('');
            setResults([]);
        } catch (error) {
            console.error('Error joining room:', error);
        }
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.titleRow}>
                <h3>Capsa</h3>
                <button
                    className={styles.createButton}
                    onClick={() => setIsCreateChatOpen(true)}
                    aria-label="Новый чат"
                >
                    <Plus size={18} />
                </button>
            </div>

            <SearchBar
                searchTerm={searchTerm}
                onSearchTermChange={handleSearchChange}
                results={results}
                loading={loading}
                onRoomClick={handleRoomClick}
            />

            {pathname.startsWith('/chats') && <RoomList />}

            <Navbar />

            <CreateChatModal
                isOpen={isCreateChatOpen}
                onClose={() => setIsCreateChatOpen(false)}
            />
        </div>
    );
};

export default Sidebar;
