import styles from './SearchBar.module.css';
import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

const SearchBar = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() =>{
            setLoading(true);

            setLoading(false);
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