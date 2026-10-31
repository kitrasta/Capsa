import styles from './Sidebar.module.css';
import Navbar from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';
import RoomList from './RoomList/RoomList';
import CreateChatModal from '../CreateChat/CreateChatModal';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
    searchPublicRooms,
    searchUsers,
    joinRoom,
    createDirectChat,
} from '../../shared/lib/matrix';
import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';
import type { UserSearchResult } from '../../shared/lib/matrix';

const Sidebar = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<IPublicRoomsChunkRoom[]>([]);
    const [users, setUsers] = useState<UserSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreateChatOpen, setIsCreateChatOpen] = useState(false);
    // У каждого поиска своя версия: debounce отменяет только таймер,
    // но не уже отправленный HTTP-запрос. Ответ старой версии игнорируем.
    const searchVersionRef = useRef(0);

    useEffect(() => {
        const version = ++searchVersionRef.current;
        const term = searchTerm.trim();
        if (term === '') return;

        const timer = setTimeout(async () => {
            setLoading(true);
            // комнаты и людей ищем параллельно:
            // одна из веток может упасть — вторая покажется всё равно
            const [roomsResult, usersResult] = await Promise.allSettled([
                searchPublicRooms(term),
                searchUsers(term),
            ]);

            // Пользователь уже изменил или очистил запрос — этот ответ
            // больше не имеет права перезаписать результаты и loader.
            if (version !== searchVersionRef.current) return;

            if (roomsResult.status === 'fulfilled') {
                setResults(roomsResult.value);
            } else {
                console.error('Error searching public rooms:', roomsResult.reason);
                setResults([]);
            }
            if (usersResult.status === 'fulfilled') {
                setUsers(usersResult.value);
            } else {
                console.error('Error searching users:', usersResult.reason);
                setUsers([]);
            }
            setLoading(false);
        }, 500);

        return () => {
            clearTimeout(timer);
            // В том числе инвалидирует запрос при размонтировании Sidebar.
            searchVersionRef.current += 1;
        };
    }, [searchTerm]);

    // стабильные обработчики: без них memo результатов поиска
    // никогда бы не пропустил ре-рендер
    const handleSearchChange = useCallback((value: string) => {
        // Инвалидируем сразу, не дожидаясь следующего effect.
        searchVersionRef.current += 1;
        setSearchTerm(value);
        if (value.trim() === '') {
            setResults([]);
            setUsers([]);
            setLoading(false);
        }
    }, []);

    const resetSearch = useCallback(() => {
        searchVersionRef.current += 1;
        setSearchTerm('');
        setResults([]);
        setUsers([]);
        setLoading(false);
    }, []);

    const handleRoomClick = useCallback(async (roomId: string) => {
        try {
            await joinRoom(roomId);
            resetSearch();
        } catch (error) {
            console.error('Error joining room:', error);
        }
    }, [resetSearch]);

    const handleUserClick = useCallback(async (userId: string) => {
        try {
            const roomId = await createDirectChat(userId);
            resetSearch();
            navigate(`/chats/${encodeURIComponent(roomId)}`);
        } catch (error) {
            console.error('Error creating direct chat:', error);
        }
    }, [resetSearch, navigate]);

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
                users={users}
                loading={loading}
                onRoomClick={handleRoomClick}
                onUserClick={handleUserClick}
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
