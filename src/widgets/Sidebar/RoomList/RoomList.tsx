import styles from './RoomList.module.css';
import { useState, useEffect } from 'react';
import { Room } from 'matrix-js-sdk';
import { getMyRooms } from '../../../shared/lib/matrix/client';

interface Props {
    reloadKey?: number;
}

const RoomList = ({ reloadKey = 0 }: Props) => {
    const [myRooms, setMyRooms] = useState<Room[]>([]);

    useEffect(() => {
        const loadRooms = async () => {
            const rooms = await getMyRooms();
            setMyRooms(rooms);
        };
        loadRooms();
    }, [reloadKey]);

    return (
        <div className={styles.rooms}>
            {myRooms.map((room) => (
                <div className={styles.room} key={room.roomId}>
                    {room.name}
                </div>
            ))}
        </div>
    );
};

export default RoomList;
