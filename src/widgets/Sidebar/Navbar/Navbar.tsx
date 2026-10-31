import styles from './Navbar.module.css';
import {NavLink} from 'react-router-dom';
import { Users, MessageSquare, Phone, Settings} from 'lucide-react'


const Navbar = () => {
    return (

    <nav className={styles.wrapper}>
        <NavLink
            to="/contacts"
            aria-label="Контакты"
            className={({ isActive}) => isActive ? styles.active : ''}
            >
                <Users size={24}/>
        </NavLink>

        <NavLink
        to='/calls'
        aria-label='Звонки'
        className={({ isActive}) => isActive ? styles.active : ''}
         >
            <Phone size={24} />
         </NavLink>
         <NavLink
         to='/chats'
         aria-label='Чаты'
         className={({ isActive}) => isActive ? styles.active : ''}
         >
            <MessageSquare size={24} />
         </NavLink>
         <NavLink
            to='/settings'
            aria-label='Настройки'
            className={({ isActive}) => isActive ? styles.active : ''}
         >
            <Settings size={24} />

         </NavLink>

    </nav>

    )
}

export default Navbar;