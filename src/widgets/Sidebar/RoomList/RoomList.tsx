import styles from './RoomList.module.css';
import { useState, useEffect } from 'react';
import { Room, ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItem from './RoomListItem';

const RoomList = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [myRooms, setMyRooms] = useState<Room[]>([]);

    // /chats/:roomId, roomId URL-encoded (содержит ! и :)
    const activeRoomId = pathname.startsWith('/chats/')
        ? decodeURIComponent(pathname.slice('/chats/'.length))
        : null;

    useEffect(() => {
        const client = getClient();

        const refresh = () => {
            const rooms = client
                .getRooms()
                .filter((room) => room.getMyMembership() === 'join')
                // самые свежие сверху
                .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());

            // пропускаем рендер, если список фактически не изменился:
            // sync-циклы сами по себе ничего не меняют
            setMyRooms((prev) => {
                if (
                    prev.length === rooms.length &&
                    prev.every((room, i) => room === rooms[i])
                ) {
                    return prev;
                }
                return rooms;
            });
        };

        refresh();

        // после первого sync стор наполнен — показываем комнаты
        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared) {
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

    const handleRoomClick = (roomId: string) => {
        navigate(`/chats/${encodeURIComponent(roomId)}`);
    };

    return (
        <div className={styles.rooms}>
            {myRooms.map((room) => (
                <RoomListItem
                    key={room.roomId}
                    room={room}
                    active={room.roomId === activeRoomId}
                    onClick={handleRoomClick}
                />
            ))}
        </div>
    );
};

export default RoomList;
