import styles from './SearchBar.module.css';
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { searchPublicRooms } from '../../../shared/lib/matrix/client';

const SearchBar = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (searchTerm === '') {
            setResults([]);
            return;
        }
        const timer = setTimeout(async() =>{
            setLoading(true);
            try{
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

    return (
        <div className={styles.wrapper}>

            <Search className={styles.icon} size={20} />
            <input
                className={styles.input}
                type="text"
                placeholder='Search'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
       
        </div>


    )

}

export default SearchBar;