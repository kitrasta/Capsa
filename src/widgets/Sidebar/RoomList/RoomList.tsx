import styles from './RoomList.module.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, ClientEvent, RoomEvent, RoomStateEvent, SyncState, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix/client';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItem from './RoomListItem';

const COLLAPSED_SPACES_KEY = 'capsa.collapsed-spaces';

const readCollapsed = (): Set<string> => {
    try {
        const raw = localStorage.getItem(COLLAPSED_SPACES_KEY);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
};

const writeCollapsed = (ids: Set<string>) => {
    localStorage.setItem(COLLAPSED_SPACES_KEY, JSON.stringify([...ids]));
};

interface SpaceGroup {
    space: Room;
    children: Room[];
}

// распределяем комнаты по секциям-пространствам:
// ребёнок, заявленный в нескольких пространствах, уходит первому
const groupBySpaces = (rooms: Room[]): { flat: Room[]; groups: SpaceGroup[] } => {
    const client = getClient();
    const spaces = rooms.filter((room) => room.isSpaceRoom());
    const plain = rooms.filter((room) => !room.isSpaceRoom());

    const claimed = new Set<string>();
    const groups: SpaceGroup[] = spaces.map((space) => {
        const children = space.currentState
            .getStateEvents('m.space.child')
            .map((event) => ({
                roomId: event.getStateKey() ?? '',
                order: event.getContent<{ order?: string }>().order ?? '',
            }))
            .filter(({ roomId }) => {
                // ребёнок должен быть в общем списке и ещё не занят другим пространством
                if (claimed.has(roomId)) return false;
                const room = client.getRoom(roomId);
                return !!room && !room.isSpaceRoom() && room.getMyMembership() === 'join';
            })
            .sort((a, b) => a.order.localeCompare(b.order))
            .map(({ roomId }) => {
                claimed.add(roomId);
                return client.getRoom(roomId) as Room;
            });

        return { space, children };
    });

    const flat = plain.filter((room) => !claimed.has(room.roomId));
    return { flat, groups };
};

const RoomList = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    const [myRooms, setMyRooms] = useState<Room[]>([]);
    const [collapsedSpaces, setCollapsedSpaces] = useState<Set<string>>(readCollapsed);

    // /chats/:roomId, roomId URL-encoded (содержит ! и :)
    const activeRoomId = pathname.startsWith('/chats/')
        ? decodeURIComponent(pathname.slice('/chats/'.length))
        : null;

    const refresh = useCallback(() => {
        const client = getClient();
        const rooms = client
            .getRooms()
            .filter((room) => room.getMyMembership() === 'join')
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
        // в пространстве добавили/убрали комнату (m.space.child — это state)
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

    // распределяем: плоский список + секции-пространства
    const { flat, groups } = useMemo(() => groupBySpaces(myRooms), [myRooms]);

    const handleToggleSpace = (spaceId: string) => {
        setCollapsedSpaces((prev) => {
            const next = new Set(prev);
            if (next.has(spaceId)) {
                next.delete(spaceId);
            } else {
                next.add(spaceId);
            }
            writeCollapsed(next);
            return next;
        });
    };

    const handleRoomClick = (roomId: string) => {
        navigate(`/chats/${encodeURIComponent(roomId)}`);
    };

    return (
        <div className={styles.rooms}>
            {flat.map((room) => (
                <RoomListItem
                    key={room.roomId}
                    room={room}
                    active={room.roomId === activeRoomId}
                    onClick={handleRoomClick}
                />
            ))}

            {groups.map(({ space, children }) => (
                <div key={space.roomId} className={styles.spaceGroup}>
                    <button
                        className={styles.spaceHeader}
                        onClick={() => handleToggleSpace(space.roomId)}
                        aria-expanded={!collapsedSpaces.has(space.roomId)}
                    >
                        <span className={styles.spaceTitle}>{space.name}</span>
                        <span className={styles.spaceCount}>{children.length}</span>
                    </button>

                    {!collapsedSpaces.has(space.roomId) &&
                        children.map((room) => (
                            <RoomListItem
                                key={room.roomId}
                                room={room}
                                active={room.roomId === activeRoomId}
                                onClick={handleRoomClick}
                            />
                        ))}
                </div>
            ))}
        </div>
    );
};

export default RoomList;
