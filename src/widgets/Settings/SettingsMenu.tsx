import styles from './SettingsMenu.module.css';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Bell,
    LogOut,
    Palette,
    Smartphone,
    SlidersHorizontal,
    X,
} from 'lucide-react';
import { logout } from '../../shared/lib/matrix/client';

interface Section {
    id: string;
    label: string;
    sub?: string;
    icon: typeof Bell;
}

const sections: Section[] = [
    { id: 'general', label: 'Общие', icon: SlidersHorizontal },
    { id: 'devices', label: 'Устройства', sub: 'Сессии', icon: Smartphone },
    { id: 'appearance', label: 'Оформление', icon: Palette },
    { id: 'notifications', label: 'Уведомления', icon: Bell },
];

const SettingsMenu = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    // перенесено из SettingsPage как есть
    const handleLogout = async () => {
        try {
            await logout();
        } catch {
            // ошибку не показываем — юзер уже вышел локально
        }
        navigate('/auth');
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <h3 className={styles.title}>Настройки</h3>
                <button
                    className={styles.closeButton}
                    onClick={() => navigate('/chats')}
                    aria-label="Закрыть настройки"
                >
                    <X size={20} />
                </button>
            </div>

            <nav className={styles.menu}>
                {sections.map(({ id, label, sub, icon: Icon }) => {
                    const active = pathname.startsWith(`/settings/${id}`);
                    return (
                        <button
                            key={id}
                            className={`${styles.row} ${active ? styles.rowActive : ''}`}
                            onClick={() => navigate(`/settings/${id}`)}
                        >
                            <Icon className={styles.rowIcon} size={20} />
                            <span className={styles.rowLabel}>{label}</span>
                            {sub && <span className={styles.rowSub}>{sub}</span>}
                        </button>
                    );
                })}
            </nav>

            <div className={styles.footer}>
                <button className={styles.logoutRow} onClick={handleLogout}>
                    <LogOut className={styles.logoutIcon} size={20} />
                    <span className={styles.logoutLabel}>Выйти</span>
                </button>
            </div>
        </div>
    );
};

export default SettingsMenu;
