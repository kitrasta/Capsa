import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
    getAppearanceSettings,
    setAppearanceSettings,
    subscribeAppearance,
    type ThemePreference,
} from '../shared/lib/appearance';
import styles from './SettingsPages.module.css';

const options: Array<{
    value: ThemePreference;
    title: string;
    description: string;
    icon: typeof Monitor;
}> = [
    {
        value: 'system',
        title: 'Системная',
        description: 'Следует настройке операционной системы',
        icon: Monitor,
    },
    {
        value: 'light',
        title: 'Светлая',
        description: 'Светлый фон и тёмный текст',
        icon: Sun,
    },
    {
        value: 'dark',
        title: 'Тёмная',
        description: 'Тёмный фон и светлый текст',
        icon: Moon,
    },
];

const AppearanceSettingsPage = () => {
    const settings = useSyncExternalStore(subscribeAppearance, getAppearanceSettings);

    return (
        <div className={styles.wrapper}>
            <div className={styles.column}>
                <header className={styles.pageHeader}>
                    <div>
                        <h1 className={styles.title}>Оформление</h1>
                        <p className={styles.description}>
                            Выберите, как Capsa выглядит на этом устройстве.
                        </p>
                    </div>
                </header>

                <fieldset className={styles.settingsCard}>
                    <legend className={styles.sectionTitle}>Тема</legend>
                    <div className={styles.optionList}>
                        {options.map(({ value, title, description, icon: Icon }) => (
                            <label
                                className={`${styles.option} ${settings.theme === value ? styles.optionSelected : ''}`}
                                key={value}
                            >
                                <Icon className={styles.optionIcon} size={20} />
                                <span className={styles.optionText}>
                                    <span className={styles.optionTitle}>{title}</span>
                                    <span className={styles.optionDescription}>{description}</span>
                                </span>
                                <input
                                    className={styles.radio}
                                    type="radio"
                                    name="theme"
                                    value={value}
                                    checked={settings.theme === value}
                                    onChange={() => setAppearanceSettings({ theme: value })}
                                />
                            </label>
                        ))}
                    </div>
                </fieldset>
            </div>
        </div>
    );
};

export default AppearanceSettingsPage;
