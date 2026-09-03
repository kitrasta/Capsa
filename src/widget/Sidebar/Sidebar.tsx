import styles from './Sidebar.module.css';
import { Navbar } from './Navbar/Navbar';

 const Sidebar = () => {
    return (
        <div className={styles.wrapper}>
            <h3>Capsa</h3>
            <Navbar />

        </div>
            

    )
}

export default Sidebar;