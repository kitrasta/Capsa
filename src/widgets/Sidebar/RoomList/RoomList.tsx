import styles from './RoomList.module.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Room, ClientEvent, RoomEvent, RoomStateEvent, SyncState, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient, getRoomSummary } from '../../../shared/lib/matrix/client';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItem from './RoomListItem';
import UnjoinedRoomItem from './UnjoinedRoomItem';

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

interface UnjoinedChild {
    roomId: string;
    name: string | null;
    avatarUrl: string | null;
    order: string;
    via: string[];
}

// единый список детей пространства в порядке order:
// типы элементов различаются — joined и не-joined
export type SpaceChildEntry =
    | { kind: 'joined'; room: Room; order: string }
    | { kind: 'unjoined'; child: UnjoinedChild; order: string };

interface SpaceGroup {
    space: Room;
    children: SpaceChildEntry[];
    unjoinedChildren: UnjoinedChild[];
}

// распределяем комнаты по секциям-пространствам:
// ребёнок, заявленный в нескольких пространствах, уходит первому.
// не-joined дети НЕ грузят summary здесь — только собираются в список
const groupBySpaces = (rooms: Room[]): { flat: Room[]; groups: SpaceGroup[] } => {
    const client = getClient();
    const spaces = rooms.filter((room) => room.isSpaceRoom());
    const plain = rooms.filter((room) => !room.isSpaceRoom());

    const claimed = new Set<string>();
    const groups: SpaceGroup[] = spaces.map((space) => {
        const children: SpaceChildEntry[] = space.currentState
            .getStateEvents('m.space.child')
            .map((event) => ({
                roomId: event.getStateKey() ?? '',
                order: event.getContent<{ order?: string }>().order ?? '',
                via: event.getContent<{ via?: string[] }>().via ?? [],
            }))
            .filter(({ roomId }) => {
                // ребёнок ещё не занят другим пространством
                return roomId !== '' && !claimed.has(roomId);
            })
            .map(({ roomId, order, via }) => {
                const room = client.getRoom(roomId);

                // вложенные пространства не показываем — как и раньше
                if (room && room.isSpaceRoom()) {
                    return null;
                }

                claimed.add(roomId);

                if (room && room.getMyMembership() === 'join') {
                    return { kind: 'joined', room, order } as SpaceChildEntry;
                }

                // комнаты нет в сторе (или мы не вступили) — кандидат на summary
                return {
                    kind: 'unjoined',
                    child: { roomId, name: null, avatarUrl: null, order, via },
                    order,
                } as SpaceChildEntry;
            })
            .filter((entry): entry is SpaceChildEntry => entry !== null)
            // joined и unjoined дети сортируются ВМЕСТЕ по order
            .sort((a, b) => a.order.localeCompare(b.order));

        return {
            space,
            children,
            unjoinedChildren: children
                .filter((entry) => entry.kind === 'unjoined')
                .map((entry) => (entry as { kind: 'unjoined'; child: UnjoinedChild }).child),
        };
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

    // summary не-joined детей: roomId → {name, avatarUrl}
    const [summaries, setSummaries] = useState<
        Record<string, { name: string | null; avatarUrl: string | null }>
    >({});

    const unjoinedChildren = useMemo(
        () => groups.flatMap((group) => group.unjoinedChildren),
        [groups],
    );

    // грузим summary для не-joined детей; каждый roomId — не больше одного запроса
    const fetchedSummariesRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        for (const child of unjoinedChildren) {
            if (fetchedSummariesRef.current.has(child.roomId)) continue;
            fetchedSummariesRef.current.add(child.roomId);

            getRoomSummary(child.roomId, child.via)
                .then(({ name, avatar_url }) => {
                    setSummaries((prev) => ({
                        ...prev,
                        [child.roomId]: { name, avatarUrl: avatar_url },
                    }));
                })
                .catch((error) => {
                    console.error('Failed to load room summary:', error);
                });
        }
    }, [unjoinedChildren]);

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

            {groups.map(({ space, children }) => {
                if (children.length === 0) return null;

                const collapsed = collapsedSpaces.has(space.roomId);
                return (
                    <div key={space.roomId} className={styles.spaceGroup}>
                        <button
                            className={styles.spaceHeader}
                            onClick={() => handleToggleSpace(space.roomId)}
                            aria-expanded={!collapsed}
                        >
                            <ChevronDown
                                size={14}
                                className={`${styles.spaceChevron} ${
                                    collapsed ? styles.spaceChevronCollapsed : ''
                                }`}
                            />
                            <span className={styles.spaceTitle}>{space.name}</span>
                            <span className={styles.spaceCount}>{children.length}</span>
                        </button>

                        {!collapsed &&
                            children.map((entry) => {
                                if (entry.kind === 'joined') {
                                    return (
                                        <RoomListItem
                                            key={entry.room.roomId}
                                            room={entry.room}
                                            active={entry.room.roomId === activeRoomId}
                                            onClick={handleRoomClick}
                                        />
                                    );
                                }

                                const summary = summaries[entry.child.roomId];
                                return (
                                    <UnjoinedRoomItem
                                        key={entry.child.roomId}
                                        roomId={entry.child.roomId}
                                        name={summary?.name ?? null}
                                        avatarUrl={summary?.avatarUrl ?? null}
                                    />
                                );
                            })}
                    </div>
                );
            })}
        </div>
    );
};

export default RoomList;
