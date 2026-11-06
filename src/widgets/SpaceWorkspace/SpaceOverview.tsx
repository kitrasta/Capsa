import { ArrowLeft, ChevronRight, Users } from 'lucide-react';
import { EventType } from 'matrix-js-sdk';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SpaceAvatar from './SpaceAvatar';
import { useSpaceWorkspaceContext } from './SpaceWorkspaceContext';
import {
    childSpaceNavigationState,
    parentSpaceNavigationState,
    readSpaceAncestry,
    spaceNavigationState,
} from './spaceNavigation';
import styles from './SpaceWorkspace.module.css';

const SpaceOverview = () => {
    const { spaceId = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const {
        space,
        items,
        isEnriching,
        enrichmentError,
        unavailable,
    } = useSpaceWorkspaceContext();
    const ancestry = readSpaceAncestry(location.state, spaceId);
    const parentSpaceId = ancestry.at(-1) ?? null;
    const state = spaceNavigationState(ancestry);
    const goBack = () => {
        if (!parentSpaceId) {
            navigate('/chats');
            return;
        }
        navigate(`/spaces/${encodeURIComponent(parentSpaceId)}`, {
            state: parentSpaceNavigationState(location.state, spaceId),
        });
    };
    const name = space?.name || spaceId.split(':')[0];
    const topicEvent = space?.currentState.getStateEvents(EventType.RoomTopic, '');
    const topic = topicEvent?.getContent<{ topic?: unknown }>().topic;
    const memberCount = space?.getJoinedMemberCount() ?? 0;

    if (unavailable) {
        return (
            <section className={styles.overview} aria-label="Обзор пространства">
                <div className={styles.unavailable}>
                    <h1>Пространство недоступно</h1>
                    <p>Оно могло быть удалено, или у вас больше нет доступа.</p>
                    <button
                        className={styles.rootButton}
                        type="button"
                        onClick={goBack}
                    >
                        {parentSpaceId ? 'Назад к родительскому пространству' : 'Все чаты'}
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className={styles.overview} aria-label="Обзор пространства">
            <button
                className={styles.mobileRootBack}
                type="button"
                onClick={goBack}
                aria-label={parentSpaceId ? 'Назад к родительскому пространству' : 'Все чаты'}
            >
                <ArrowLeft size={20} />
                {parentSpaceId ? 'Назад' : 'Все чаты'}
            </button>
            <header className={styles.overviewHeader}>
                <SpaceAvatar
                    name={name}
                    avatarUrl={space?.getMxcAvatarUrl() ?? null}
                    size={72}
                    kind="space"
                />
                <div className={styles.overviewTitle}>
                    <h1>{name}</h1>
                    {typeof topic === 'string' && topic && <p className={styles.topic}>{topic}</p>}
                    {memberCount > 0 && (
                        <p className={styles.memberCount}>
                            <Users size={15} />
                            {memberCount} участник.
                        </p>
                    )}
                </div>
            </header>

            <div className={styles.catalog}>
                <h2 className={styles.catalogHeading}>Комнаты и пространства</h2>
                {isEnriching && <p className={styles.catalogStatus}>Обновляем список…</p>}
                {enrichmentError && (
                    <p className={styles.catalogStatus} role="status">
                        Не удалось обновить сведения о комнатах. Показаны доступные данные.
                    </p>
                )}
                {!isEnriching && items.length === 0 && (
                    <p className={styles.catalogStatus}>В пространстве пока нет комнат</p>
                )}
                <div className={styles.catalogList}>
                    {items.map((item) => {
                        const itemName = item.noAccess ? 'Недоступная комната' : item.name;
                        return (
                            <button
                                className={styles.catalogItem}
                                type="button"
                                key={item.roomId}
                                onClick={() => {
                                    if (item.kind === 'space') {
                                        navigate(`/spaces/${encodeURIComponent(item.roomId)}`, {
                                            state: childSpaceNavigationState(
                                                location.state,
                                                spaceId,
                                                item.roomId,
                                            ),
                                        });
                                    } else {
                                        navigate(
                                            `/spaces/${encodeURIComponent(spaceId)}/chats/${encodeURIComponent(item.roomId)}`,
                                            { state },
                                        );
                                    }
                                }}
                            >
                                <SpaceAvatar
                                    name={itemName}
                                    avatarUrl={item.noAccess ? null : item.avatarUrl}
                                    size={44}
                                    kind={item.kind}
                                />
                                <span className={styles.catalogItemInfo}>
                                    <span className={styles.catalogItemName}>{itemName}</span>
                                    <span className={styles.catalogItemMeta}>
                                        {item.noAccess
                                            ? 'Нет доступа'
                                            : item.kind === 'space'
                                              ? 'Пространство'
                                              : item.joined
                                                ? 'Открыть'
                                                : 'Просмотр и вступление'}
                                    </span>
                                </span>
                                {item.unread > 0 && (
                                    <span className={styles.unreadBadge} aria-label={`${item.unread} непрочитанных`}>
                                        {item.unread > 99 ? '99+' : item.unread}
                                    </span>
                                )}
                                <ChevronRight className={styles.rowChevron} size={18} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default SpaceOverview;
