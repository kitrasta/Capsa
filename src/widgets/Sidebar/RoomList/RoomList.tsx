import styles from './RoomList.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientEvent, RoomEvent, RoomStateEvent, SyncState, MatrixEventEvent } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItemContainer from './RoomListItemContainer';

const readJoinedRooms = (): Room[] =>
    getClient()
        .getRooms()
        .filter(
            (room) => room.getMyMembership() === 'join' && !room.isSpaceRoom(),
        )
        .sort((a, b) => b.getLastActiveTimestamp() - a.getLastActiveTimestamp());

const RoomList = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // MainLayout монтирует список после запуска клиента, поэтому начальное
    // состояние можно прочитать сразу, не дожидаясь следующего Sync.Prepared.
    const [myRooms, setMyRooms] = useState<Room[]>(readJoinedRooms);

    // /chats/:roomId, roomId URL-encoded (содержит ! и :)
    const activeRoomId = pathname.startsWith('/chats/')
        ? decodeURIComponent(pathname.slice('/chats/'.length))
        : null;

    const refresh = useCallback(() => {
        const rooms = readJoinedRooms();

        // Единый плоский список: Spaces не влияют на положение комнаты.
        // Пропускаем рендер, если состав или порядок не изменились.
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

        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared) refresh();
        };
        const handleRoom = () => refresh();

        client.on(ClientEvent.Sync, handleSync);
        client.on(ClientEvent.Room, handleRoom);
        client.on(RoomEvent.MyMembership, handleRoom);
        client.on(RoomEvent.Timeline, handleRoom);
        client.on(MatrixEventEvent.Decrypted, handleRoom);
        client.on(RoomStateEvent.Events, handleRoom);

        return () => {
            client.off(ClientEvent.Sync, handleSync);
            client.off(ClientEvent.Room, handleRoom);
            client.off(RoomEvent.MyMembership, handleRoom);
            client.off(RoomEvent.Timeline, handleRoom);
            client.off(MatrixEventEvent.Decrypted, handleRoom);
            client.off(RoomStateEvent.Events, handleRoom);
        };
    }, [refresh]);

    // События непрочитанных и прочтений живут на уровне комнаты —
    // подписываемся на каждую комнату из списка.
    const roomHandlersRef = useRef(new Map<Room, () => void>());

    useEffect(() => {
        const handlers = roomHandlersRef.current;

        for (const [room, handler] of handlers) {
            room.off(RoomEvent.UnreadNotifications, handler);
            room.off(RoomEvent.Receipt, handler);
        }
        handlers.clear();

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

    const handleRoomClick = useCallback(
        (roomId: string) => {
            navigate(`/chats/${encodeURIComponent(roomId)}`);
        },
        [navigate],
    );

    return (
        <div className={styles.rooms}>
            {myRooms.map((room) => (
                <RoomListItemContainer
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
