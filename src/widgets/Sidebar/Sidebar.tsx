import styles from './Sidebar.module.css';
import Navbar from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';
import { useState, useEffect } from 'react';
import { searchPublicRooms, joinRoom } from '../../shared/lib/matrix/client';
import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';

const Sidebar = () => {



    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<IPublicRoomsChunkRoom[]>([]);
    const [loading, setLoading] = useState(false);

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

            <Navbar />

        </div>


    )
}

export default Sidebar;