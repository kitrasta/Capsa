import styles from './SettingsStubPage.module.css';

interface SettingsStubPageProps {
    title: string;
}

// заглушка для секций настроек в разработке
const SettingsStubPage = ({ title }: SettingsStubPageProps) => (
    <div className={styles.wrapper}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.hint}>В разработке</p>
    </div>
);

export default SettingsStubPage;
