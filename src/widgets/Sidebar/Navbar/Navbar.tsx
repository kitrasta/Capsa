import { NavLink } from 'react-router-dom';
import { Users, MessageSquare, Phone, Settings } from 'lucide-react';
import styles from './Navbar.module.css';

const items = [
    { to: '/chats', label: 'Чаты', Icon: MessageSquare },
    { to: '/contacts', label: 'Контакты', Icon: Users },
    { to: '/calls', label: 'Звонки', Icon: Phone },
    { to: '/settings', label: 'Настройки', Icon: Settings },
];

const Navbar = () => (
    <nav className={styles.wrapper} aria-label="Основная навигация">
        {items.map(({ to, label, Icon }) => (
            <NavLink
                key={to}
                to={to}
                aria-label={label}
                className={({ isActive }) =>
                    `${styles.link} ${isActive ? styles.active : ''}`
                }
            >
                <Icon size={21} />
                <span className={styles.label}>{label}</span>
            </NavLink>
        ))}
    </nav>
);

export default Navbar;
