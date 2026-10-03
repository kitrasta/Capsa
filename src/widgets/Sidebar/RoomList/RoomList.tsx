import styles from './RoomList.module.css';
import { useState, useEffect } from 'react';
import { Room, ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import RoomListItem from './RoomListItem';

const RoomList = () => {
    const [myRooms, setMyRooms] = useState<Room[]>([]);

    useEffect(() => {
        const client = getClient();

        const refresh = () => {
            const rooms = client
                .getRooms()
                .filter((room) => room.getMyMembership() === 'join')
                // самые свежие сверху
                .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());
            setMyRooms(rooms);
        };

        refresh();

        // первый sync завершился — стор наполнился данными
        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared || state === SyncState.Syncing) {
                refresh();
            }
        };

        // вступили в комнату / получили инвайт / пришло новое сообщение
        const handleRoom = () => refresh();

        client.on(ClientEvent.Sync, handleSync);
        client.on(ClientEvent.Room, handleRoom);
        client.on(RoomEvent.MyMembership, handleRoom);
        client.on(RoomEvent.Timeline, handleRoom);

        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, handleRoom);
            client.off(RoomEvent.MyMembership, handleRoom);
            client.off(RoomEvent.Timeline, handleRoom);
        };
    }, []);

    return (
        <div className={styles.rooms}>
            {myRooms.map((room) => (
                <RoomListItem key={room.roomId} room={room} client={getClient()} />
            ))}
        </div>
    );
};

export default RoomList;
