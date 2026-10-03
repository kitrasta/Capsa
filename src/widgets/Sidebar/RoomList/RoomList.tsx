import styles from './RoomList.module.css';
import { useState, useEffect } from 'react';
import { Room, ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';

const RoomList = () => {
    const [myRooms, setMyRooms] = useState<Room[]>([]);

    useEffect(() => {
        const client = getClient();

        const refresh = () => {
            // берем комнаты из локального стора клиента,
            // чтобы не зависеть от серверного запроса
            const rooms = client
                .getRooms()
                .filter((room) => room.getMyMembership() === 'join');
            setMyRooms(rooms);
        };

        refresh();

        // первый sync завершился — стора наполнилась данными
        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared || state === SyncState.Syncing) {
                refresh();
            }
        };

        // вступили в комнату / получили инвайт / комнату добавили в стор
        const handleRoom = () => refresh();

        client.on(ClientEvent.Sync, handleSync);
        client.on(ClientEvent.Room, handleRoom);
        client.on(RoomEvent.MyMembership, handleRoom);

        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, handleRoom);
            client.off(RoomEvent.MyMembership, handleRoom);
        };
    }, []);

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
