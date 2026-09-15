import styles from './Sidebar.module.css';
import Navbar from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';
import {useLocation} from 'react-router-dom'
import { useState, useEffect} from 'react';
import { searchPublicRooms, joinRoom, getMyRooms } from '../../shared/lib/matrix/client';
import type { IPublicRoomsChunkRoom, Room } from 'matrix-js-sdk';


const Sidebar = () => {
    const {pathname} = useLocation();



    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<IPublicRoomsChunkRoom[]>([]);
    const [loading, setLoading] = useState(false);
    const [myRooms, setMyRooms] = useState<Room[]>([])

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

    useEffect(() => {
        const loadRooms = async () => {
            const rooms = await getMyRooms();
            setMyRooms(rooms);
        };
        loadRooms();
    }, []);



    const handleSearchChange = (value: string) => {
        setSearchTerm(value);
        if (value === '') {
            setResults([]);
        }
    };

    const handleRoomClick = async (roomId: string) => {
        try {
            await joinRoom(roomId);
            const rooms = await getMyRooms();
            setMyRooms(rooms);
        } catch (error) {
            console.error('че то сломалось:', error)
        }

    }


    return (
        <div className={styles.wrapper}>
            <h3>Capsa</h3>

            <SearchBar
                searchTerm={searchTerm}
                onSearchTermChange={handleSearchChange}
                results={results}
                loading={loading}
                onRoomClick={handleRoomClick} />

            {pathname === '/chats' && (
                <div className={styles.rooms}>
                    {myRooms.map((room) => (
                        <div className={styles.room} key={room.roomId}>
                            {room.name}
                        </div>
                    ))}
                </div>
                
            )}
                
                    

                

            <Navbar />

        </div>


    )
}

export default Sidebar;