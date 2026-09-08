import styles from './Sidebar.module.css';
import  Navbar  from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';

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

    return (
        <div className={styles.wrapper}>
            <h3>Capsa</h3>
            <SearchBar />
            <Navbar />

        </div>
            

    )
}

export default Sidebar;