import styles from './Sidebar.module.css';
import  Navbar  from './Navbar/Navbar';
import SearchBar from './Search/SearchBar';

 const Sidebar = () => {
    return (
        <div className={styles.wrapper}>
            <h3>Capsa</h3>
            <SearchBar />
            <Navbar />

        </div>
            

    )
}

export default Sidebar;