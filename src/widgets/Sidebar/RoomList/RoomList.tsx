import styles from './RoomList.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItemContainer from './RoomListItemContainer';
import UnjoinedRoomItem from './UnjoinedRoomItem';
import FolderTabs from './FolderTabs';
import SpaceRow from './SpaceRow';
import { useSpaceFolders } from './useSpaceFolders';

const RoomList = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const folders = useSpaceFolders();
    const [, setVersion] = useState(0);
    // Подписываемся на все joined rooms, а не только на видимый фильтр:
    // unread-badge другой папки тоже должен обновляться в фоне.
    const myRooms = getClient().getRooms().filter(
        (room) => room.getMyMembership() === 'join' && !room.isSpaceRoom(),
    );

    // /chats/:roomId, roomId URL-encoded (содержит ! и :)
    const activeRoomId = pathname.startsWith('/chats/')
        ? decodeURIComponent(pathname.slice('/chats/'.length))
        : null;

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
            const handler = () => setVersion((value) => value + 1);
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
    }, [myRooms]);

    const handleRoomClick = useCallback(
        (roomId: string) => {
            navigate(`/chats/${encodeURIComponent(roomId)}`);
        },
        [navigate],
    );

    return (
        <div className={styles.rooms}>
            <FolderTabs
                filter={folders.filter}
                path={folders.path}
                onFilterChange={folders.setFilter}
                onOpenBreadcrumb={folders.openBreadcrumb}
                onShowAll={folders.showAll}
            />

            {folders.items.map((view) => {
                if (view.kind === 'space') {
                    return (
                        <SpaceRow
                            key={view.roomId}
                            space={view}
                            onOpen={folders.openSpace}
                        />
                    );
                }

                return view.room?.getMyMembership() === 'join' ? (
                    <RoomListItemContainer
                        key={view.roomId}
                        room={view.room}
                        active={view.roomId === activeRoomId}
                        onClick={handleRoomClick}
                    />
                ) : (
                    <UnjoinedRoomItem
                        key={view.roomId}
                        roomId={view.roomId}
                        name={view.name}
                        avatarUrl={view.avatarUrl}
                        noAccess={view.noAccess}
                    />
                );
            })}
        </div>
    );
};

export default RoomList;
