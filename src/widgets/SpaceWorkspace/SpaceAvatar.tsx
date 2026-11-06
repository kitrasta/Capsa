import { Folder, Hash } from 'lucide-react';
import { useRoomListItemAvatar } from '../Sidebar/RoomList/hooks/useRoomListItemAvatar';
import styles from './SpaceWorkspace.module.css';

interface Props {
    name: string;
    avatarUrl: string | null;
    size?: number;
    kind?: 'space' | 'room';
}

const SpaceAvatar = ({ name, avatarUrl, size = 40, kind = 'room' }: Props) => {
    const avatarSrc = useRoomListItemAvatar(avatarUrl, size);
    const style = { width: size, height: size };

    if (avatarSrc) {
        return (
            <img
                className={styles.avatar}
                style={style}
                src={avatarSrc}
                alt=""
                width={size}
                height={size}
            />
        );
    }

    return (
        <span
            className={`${styles.avatar} ${styles.avatarFallback}`}
            style={style}
            aria-hidden="true"
        >
            {kind === 'space'
                ? <Folder size={Math.round(size * 0.45)} />
                : name
                  ? name.charAt(0).toUpperCase()
                  : <Hash size={Math.round(size * 0.45)} />}
        </span>
    );
};

export default SpaceAvatar;
