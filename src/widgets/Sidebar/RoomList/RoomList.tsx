import styles from './RoomList.module.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Room, ClientEvent, RoomEvent, RoomStateEvent, SyncState, MatrixEventEvent } from 'matrix-js-sdk';
import { getClient, getSpaceChildSummaries } from '../../../shared/lib/matrix';
import { useLocation, useNavigate } from 'react-router-dom';
import RoomListItemContainer from './RoomListItemContainer';
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

// данные не-joined ребёнка для списка: имя/аватар из hierarchy либо «нет доступа»
interface UnjoinedSummary {
    name: string | null;
    avatarUrl: string | null;
    noAccess?: boolean;
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

    // summary не-joined детей: roomId → имя/аватар из hierarchy либо «нет доступа»
    const [summaries, setSummaries] = useState<Record<string, UnjoinedSummary>>({});

    // один запрос на пространство (getRoomHierarchy) вместо запроса на каждую комнату.
    // Ключ дедупликации — пространство плюс набор его детей: если запоминать только
    // spaceId, комнату, добавленную в пространство позже, мы не загрузим
    const fetchedKeysRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        let cancelled = false;

        for (const group of groups) {
            if (group.unjoinedChildren.length === 0) continue;

            const spaceId = group.space.roomId;
            const childIds = group.unjoinedChildren.map((c) => c.roomId);
            const key = `${spaceId}|${[...childIds].sort().join(',')}`;
            if (fetchedKeysRef.current.has(key)) continue;
            fetchedKeysRef.current.add(key);

            getSpaceChildSummaries(spaceId)
                .then((summaryMap) => {
                    if (cancelled) return;
                    setSummaries((prev) => {
                        const next = { ...prev };
                        for (const roomId of childIds) {
                            const found = summaryMap.get(roomId);
                            next[roomId] = found
                                ? { name: found.name, avatarUrl: found.avatarUrl }
                                : { name: null, avatarUrl: null, noAccess: true };
                        }
                        return next;
                    });
                })
                .catch((error: unknown) => {
                    // запрос не удался целиком (сеть, нет доступа к самому пространству):
                    // НЕ помечаем детей «нет доступа» — это неправда, мы просто не знаем.
                    // Оставляем имена-заглушки и разрешаем повторную попытку
                    fetchedKeysRef.current.delete(key);
                    console.warn('Failed to load space hierarchy', spaceId, error);
                });
        }

        return () => {
            cancelled = true;
        };
    }, [groups]);

    // стабильные обработчики: memo детей (RoomListItemContainer) пропускает
    // ре-рендеры, только если их пропсы не изменились
    const handleToggleSpace = useCallback((spaceId: string) => {
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
    }, []);

    const handleRoomClick = useCallback((roomId: string) => {
        navigate(`/chats/${encodeURIComponent(roomId)}`);
    }, [navigate]);

    return (
        <div className={styles.rooms}>
            {flat.map((room) => (
                <RoomListItemContainer
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
                                        <RoomListItemContainer
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
                                        noAccess={summary?.noAccess ?? false}
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
