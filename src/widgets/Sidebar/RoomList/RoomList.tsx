import styles from './RoomList.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, ClientEvent, RoomEvent, SyncState, MatrixEventEvent } from 'matrix-js-sdk';
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

    const refresh = useCallback(() => {
        const client = getClient();
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
    }, []);

    useEffect(() => {
        const client = getClient();

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
        // зашифрованные события расшифровываются асинхронно:
        // превью обновится, когда расшифруется
        client.on(MatrixEventEvent.Decrypted, handleRoom);

        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, handleRoom);
            client.off(RoomEvent.MyMembership, handleRoom);
            client.off(RoomEvent.Timeline, handleRoom);
            client.off(MatrixEventEvent.Decrypted, handleRoom);
        };
    }, [refresh]);

    // события непрочитанных и прочтений живут на уровне комнаты —
    // подписываемся на каждую комнату из списка
    const roomHandlersRef = useRef(new Map<Room, () => void>());

    useEffect(() => {
        const handlers = roomHandlersRef.current;

        // снимаем все прежние подписки
        for (const [room, handler] of handlers) {
            room.off(RoomEvent.UnreadNotifications, handler);
            room.off(RoomEvent.Receipt, handler);
        }
        handlers.clear();

        // вешаем на актуальный набор комнат
        for (const room of myRooms) {
            const handler = () => refresh();
            handlers.set(room, handler);
            room.on(RoomEvent.UnreadNotifications, handler);
            room.on(RoomEvent.Receipt, handler);
        }

        return () => {
            for (const [room, handler] of handlers) {
                room.off(RoomEvent.UnreadNotifications, handler);
                room.off(RoomEvent.Receipt, handler);
            }
            handlers.clear();
        };
    }, [myRooms, refresh]);

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
