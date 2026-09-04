import styles from './Navbar.module.css';
import {NavLink} from 'react-router-dom';
import { Users, MessageSquare, Phone, Settings} from 'lucide-react'


const Navbar = () => {
    return (

    <nav className={styles.wrapper}>
        <NavLink
            to="/contacts"
            className={({ isActive}) => isActive ? styles.active : ''}
            >
                <Users />
        </NavLink>

        <NavLink
        to='/calls'
        className={({ isActive}) => isActive ? styles.active : ''}
         >
            <Phone />
         </NavLink>
         <NavLink
         to='/chats'
         className={({ isActive}) => isActive ? styles.active : ''}
         >
            <MessageSquare />
         </NavLink>
         <NavLink
            to='/settings'
            className={({ isActive}) => isActive ? styles.active : ''}
         >
            <Settings />

         </NavLink>

    </nav>

    )
}

export default Navbar;