import { ArrowLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SpaceAvatar from './SpaceAvatar';
import { useSpaceWorkspaceContext } from './SpaceWorkspaceContext';
import type { SpaceWorkspaceItem } from './useSpaceWorkspace';
import {
    childSpaceNavigationState,
    parentSpaceNavigationState,
    readSpaceAncestry,
    spaceNavigationState,
} from './spaceNavigation';
import styles from './SpaceWorkspace.module.css';

const SpaceSidebar = () => {
    const { spaceId = '', roomId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { space, items, joinedRooms, unavailable } = useSpaceWorkspaceContext();
    const ancestry = readSpaceAncestry(location.state, spaceId);
    const parentSpaceId = ancestry.at(-1) ?? null;
    const name = space?.name || spaceId.split(':')[0];
    const nestedSpaces = items.filter((item) => item.kind === 'space' && item.joined);
    const state = spaceNavigationState(ancestry);

    const openOverview = () => {
        navigate(`/spaces/${encodeURIComponent(spaceId)}`, { state });
    };

    const openRoom = (item: SpaceWorkspaceItem) => {
        navigate(
            `/spaces/${encodeURIComponent(spaceId)}/chats/${encodeURIComponent(item.roomId)}`,
            { state },
        );
    };

    const openSpace = (item: SpaceWorkspaceItem) => {
        navigate(`/spaces/${encodeURIComponent(item.roomId)}`, {
            state: childSpaceNavigationState(location.state, spaceId, item.roomId),
        });
    };

    const goBack = () => {
        if (!parentSpaceId) {
            navigate('/chats');
            return;
        }
        navigate(`/spaces/${encodeURIComponent(parentSpaceId)}`, {
            state: parentSpaceNavigationState(location.state, spaceId),
        });
    };

    return (
        <nav className={styles.sidebar} aria-label="Навигация по пространству">
            <div className={styles.sidebarHeader}>
                <button
                    className={styles.iconButton}
                    type="button"
                    onClick={goBack}
                    aria-label={parentSpaceId
                        ? 'Назад к родительскому пространству'
                        : 'Назад к списку чатов'}
                >
                    <ArrowLeft size={21} />
                </button>
                <SpaceAvatar
                    name={name}
                    avatarUrl={space?.getMxcAvatarUrl() ?? null}
                    kind="space"
                />
                <span className={styles.sidebarSpaceName}>
                    {unavailable ? 'Пространство недоступно' : name}
                </span>
            </div>

            <button
                className={styles.overviewButton}
                type="button"
                onClick={openOverview}
                aria-current={!roomId ? 'page' : undefined}
                disabled={unavailable}
            >
                <LayoutGrid size={18} />
                Обзор пространства
            </button>

            {!unavailable && (
                <div className={styles.sidebarLists}>
                    <section className={styles.sidebarSection} aria-labelledby="space-rooms-heading">
                        <h2 className={styles.sectionHeading} id="space-rooms-heading">Комнаты</h2>
                        {joinedRooms.length === 0 ? (
                            <p className={styles.emptyJoined}>Нет доступных комнат</p>
                        ) : (
                            joinedRooms.map((item) => (
                                <button
                                    className={`${styles.roomRow} ${roomId === item.roomId ? styles.active : ''}`}
                                    type="button"
                                    key={item.roomId}
                                    onClick={() => openRoom(item)}
                                    aria-current={roomId === item.roomId ? 'page' : undefined}
                                >
                                    <SpaceAvatar name={item.name} avatarUrl={item.avatarUrl} size={36} />
                                    <span className={styles.roomName}>{item.name}</span>
                                    {item.unread > 0 && (
                                        <span className={styles.unreadBadge} aria-label={`${item.unread} непрочитанных`}>
                                            {item.unread > 99 ? '99+' : item.unread}
                                        </span>
                                    )}
                                </button>
                            ))
                        )}
                    </section>

                    {nestedSpaces.length > 0 && (
                        <section className={styles.sidebarSection} aria-labelledby="nested-spaces-heading">
                            <h2 className={styles.sectionHeading} id="nested-spaces-heading">Пространства</h2>
                            {nestedSpaces.map((item) => (
                                <button
                                    className={styles.roomRow}
                                    type="button"
                                    key={item.roomId}
                                    onClick={() => openSpace(item)}
                                >
                                    <SpaceAvatar
                                        name={item.name}
                                        avatarUrl={item.avatarUrl}
                                        size={36}
                                        kind="space"
                                    />
                                    <span className={styles.roomName}>{item.name}</span>
                                    <ChevronRight className={styles.rowChevron} size={17} />
                                </button>
                            ))}
                        </section>
                    )}
                </div>
            )}
        </nav>
    );
};

export default SpaceSidebar;
