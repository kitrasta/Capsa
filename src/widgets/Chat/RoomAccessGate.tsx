import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import { useNavigate } from 'react-router-dom';
import {
    canPeekRoom,
    getClient,
    getRoomAccess,
    joinRoom,
    knockRoom,
    type RoomAccess,
} from '../../shared/lib/matrix';
import ChatView from './ChatView';
import { isVisibleMessage } from './hooks/useRoomTimeline';
import styles from './RoomAccessGate.module.css';

interface Props {
    roomId: string;
    backTo?: string;
    backState?: unknown;
}

interface AccessResult {
    roomId: string;
    access: RoomAccess;
}

interface PreviewResult {
    roomId: string;
    room: Room;
}

interface ActionState {
    roomId: string;
    pending: boolean;
    error: string | null;
    knockSent: boolean;
}

const fallbackName = (roomId: string): string => roomId.split(':')[0];

const PeekTimeline = ({ room }: { room: Room }) => {
    const events = room.getLiveTimeline().getEvents().filter(isVisibleMessage);
    if (events.length === 0) {
        return <p className={styles.empty}>Нет доступной истории до вступления</p>;
    }
    return (
        <div className={styles.previewList} aria-label="Доступная история">
            {events.map((event, index) => (
                <div className={styles.previewMessage} key={event.getId() ?? index}>
                    <span className={styles.previewSender}>{event.getSender()}</span>
                    <span>{event.getContent().body}</span>
                </div>
            ))}
        </div>
    );
};

const RoomAccessGate = ({ roomId, backTo, backState }: Props) => {
    const navigate = useNavigate();
    const client = getClient();
    const generation = useRef(0);
    const [accessResult, setAccessResult] = useState<AccessResult | null>(null);
    const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
    const [actionState, setActionState] = useState<ActionState | null>(null);

    useEffect(() => {
        let active = true;
        let peekStarted = false;

        const load = async () => {
            const request = ++generation.current;
            const next = await getRoomAccess(roomId);
            if (!active || request !== generation.current) return;
            setAccessResult({ roomId, access: next });

            if (next.kind === 'joined') {
                client.stopPeeking();
                return;
            }
            if (next.kind !== 'public' || !canPeekRoom(next.summary) || peekStarted) return;

            peekStarted = true;
            try {
                const preview = await client.peekInRoom(roomId, 20);
                // ClientEvent.Room от peekInRoom перезапускает классификацию, но не этот peek.
                if (!active) return;
                setPreviewResult({ roomId, room: preview });
            } catch {
                // Preview — необязательное улучшение; metadata и join остаются доступны.
                if (active) peekStarted = false;
            }
        };

        const handleRoom = () => void load();
        const handleSync = (state: SyncState) => {
            if (state === SyncState.Prepared) handleRoom();
        };
        void load();
        client.on(ClientEvent.Room, handleRoom);
        client.on(RoomEvent.MyMembership, handleRoom);
        client.on(ClientEvent.Sync, handleSync);

        return () => {
            active = false;
            generation.current += 1;
            client.off(ClientEvent.Room, handleRoom);
            client.off(RoomEvent.MyMembership, handleRoom);
            client.off(ClientEvent.Sync, handleSync);
            client.stopPeeking();
        };
    }, [client, roomId]);

    const access = accessResult?.roomId === roomId ? accessResult.access : null;
    const preview = previewResult?.roomId === roomId ? previewResult.room : null;
    const action = actionState?.roomId === roomId ? actionState : null;

    const runAction = async (kind: 'join' | 'knock') => {
        if (action?.pending) return;
        const request = generation.current;
        setActionState({ roomId, pending: true, error: null, knockSent: false });
        try {
            if (kind === 'join') await joinRoom(roomId);
            else await knockRoom(roomId);
            if (request !== generation.current) return;
            if (kind === 'knock') {
                setActionState({ roomId, pending: false, error: null, knockSent: true });
            }
        } catch {
            if (request !== generation.current) return;
            setActionState({
                roomId,
                pending: false,
                error: kind === 'join'
                    ? 'Не удалось вступить в комнату. Проверьте доступ и соединение.'
                    : 'Не удалось запросить доступ. Попробуйте снова.',
                knockSent: false,
            });
        } finally {
            if (request === generation.current) {
                setActionState((current) => current?.roomId === roomId
                    ? { ...current, pending: false }
                    : current);
            }
        }
    };

    if (!access) {
        return (
            <div className={styles.wrapper}>
                <p className={styles.empty}>Загрузка комнаты…</p>
            </div>
        );
    }

    if (access.kind === 'joined') {
        return <ChatView roomId={roomId} backTo={backTo} backState={backState} />;
    }

    const name = access.summary?.name ?? fallbackName(roomId);
    const memberCount = access.summary?.memberCount ?? 0;
    const showKnockPending = access.kind === 'knock-pending' || action?.knockSent;

    return (
        <div className={styles.wrapper}>
            <header className={styles.header}>
                <button
                    className={styles.backButton}
                    type="button"
                    onClick={() => navigate(backTo ?? '/chats', { state: backState })}
                    aria-label={backTo ? 'Назад к обзору пространства' : 'Назад к списку чатов'}
                >
                    <ArrowLeft size={21} />
                </button>
                <span className={styles.avatar} aria-hidden="true">
                    {name.charAt(0).toUpperCase()}
                </span>
                <div className={styles.headerInfo}>
                    <span className={styles.headerName}>{name}</span>
                    <span className={styles.headerStatus}>
                        {memberCount > 0 ? `${memberCount} участник.` : roomId}
                    </span>
                </div>
            </header>

            <div className={styles.content}>
                {preview && canPeekRoom(access.summary) ? (
                    <PeekTimeline room={preview} />
                ) : (
                    <p className={styles.empty}>
                        {access.kind === 'inaccessible'
                            ? 'Информация о комнате недоступна'
                            : 'История станет доступна после вступления'}
                    </p>
                )}
            </div>

            <footer className={styles.footer}>
                {action?.error && <p className={styles.error} role="alert">{action.error}</p>}
                {access.kind === 'inaccessible' ? (
                    <p className={styles.accessText}>Нет доступа к этой комнате</p>
                ) : showKnockPending ? (
                    <p className={styles.accessText}>Запрос на доступ отправлен</p>
                ) : access.kind === 'invite-only' ? (
                    <p className={styles.accessText}>Вступление по приглашению</p>
                ) : (
                    <button
                        className={styles.joinButton}
                        type="button"
                        disabled={action?.pending}
                        onClick={() => void runAction(access.kind === 'knock' ? 'knock' : 'join')}
                    >
                        {action?.pending && <Loader2 className={styles.spinner} size={17} />}
                        {action?.pending
                            ? 'Выполняем…'
                            : access.kind === 'invited'
                              ? 'Принять приглашение'
                              : access.kind === 'knock'
                                ? 'Запросить доступ'
                                : 'Вступить в комнату'}
                    </button>
                )}
            </footer>
        </div>
    );
};

export default RoomAccessGate;
