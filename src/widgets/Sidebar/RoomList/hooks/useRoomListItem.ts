// Данные одного элемента списка комнат: превью последнего сообщения,
// непрочитанные, статус «моё».
//
// Раньше всё это считалось на каждый рендер RoomList для каждой комнаты,
// а getUnreadCount гонял всю live-ленту (O(n) на комнату). Теперь:
//   - пересчёт привязан к реальным изменениям комнаты (подписка на её
//     события), а не к рендерам списка;
//   - непрочитанные: сначала серверный счётчик O(1) из sync, локальный
//     честный подсчёт — только fallback.
import { useEffect, useMemo, useState } from 'react';
import { MatrixEventEvent, NotificationCountType, RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../../shared/lib/matrix';

export interface LastMessagePreview {
    senderId: string;
    senderName: string;
    text: string;
}

export interface RoomListItemView {
    roomId: string;
    name: string;
    avatarUrl: string | null;
    lastMessage: LastMessagePreview | null;
    unread: number;
    hasUnread: boolean;
    isMe: boolean;
    // проброс аргументов хука — компонент получает всё одним объектом
    isActive: boolean;
    onClick: (roomId: string) => void;
}

// превью последнего события комнаты
const getLastMessagePreview = (room: Room): LastMessagePreview | null => {
    const event = room.getLastLiveEvent();
    if (!event) return null;

    const senderId = event.getSender() ?? '';
    const senderName = room.currentState.getMember(senderId)?.name ?? senderId;

    // зашифрованное событие до расшифровки (расшифруется асинхронно)
    if (event.getType() === 'm.room.encrypted') {
        return { senderId, senderName, text: '🔒 Зашифрованное сообщение' };
    }

    if (event.getType() === 'm.room.message') {
        const body = event.getContent<{ body?: string }>().body;
        if (!body) return null;
        return { senderId, senderName, text: body };
    }

    if (event.getType() === 'm.room.member') {
        return { senderId, senderName, text: 'обновил(а) профиль' };
    }

    return null;
};

// локальный честный подсчёт: всё в live-ленте после нашего read receipt'а,
// кроме своих сообщений. Дорогой (O(ленты)) — вызывается только как
// fallback и мемоизируется по событиям комнаты
const getLocalUnreadCount = (room: Room, myUserId: string | null): number => {
    if (!myUserId) return 0;

    const events = room.getLiveTimeline().getEvents();
    const receiptEventId = room.getEventReadUpTo(myUserId, true);
    const receiptIndex = receiptEventId
        ? events.findIndex((e) => e.getId() === receiptEventId)
        : -1;

    // receipt вне live-ленты (давно не читал) или его нет —
    // локально не сосчитать
    if (receiptIndex === -1) return 0;

    return events
        .slice(receiptIndex + 1)
        .filter((e) => e.getType() === 'm.room.message' && e.getSender() !== myUserId)
        .length;
};

// версия данных комнаты: бампаем при её реальных изменениях —
// это и триггер пересчёта, и защита от пересчёта на каждый рендер
const useRoomDataVersion = (room: Room): number => {
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const bump = () => setVersion((v) => v + 1);
        // расшифровка приходит клиентским событием и меняет превью
        const onDecrypted = (event: { getRoomId?: () => string | undefined }) => {
            if (event.getRoomId?.() === room.roomId) bump();
        };

        room.on(RoomEvent.Timeline, bump);
        room.on(RoomEvent.LocalEchoUpdated, bump);
        room.on(RoomEvent.Receipt, bump);
        room.on(RoomEvent.UnreadNotifications, bump);
        room.on(RoomStateEvent.Events, bump); // имя/аватар комнаты
        getClient().on(MatrixEventEvent.Decrypted, onDecrypted);

        return () => {
            room.off(RoomEvent.Timeline, bump);
            room.off(RoomEvent.LocalEchoUpdated, bump);
            room.off(RoomEvent.Receipt, bump);
            room.off(RoomEvent.UnreadNotifications, bump);
            room.off(RoomStateEvent.Events, bump);
            getClient().off(MatrixEventEvent.Decrypted, onDecrypted);
        };
    }, [room]);

    return version;
};

export const useRoomListItem = (
    room: Room,
    onClick: (roomId: string) => void,
    isActive: boolean,
): RoomListItemView => {
    const version = useRoomDataVersion(room);
    const myUserId = getClient().getUserId();

    const lastMessage = useMemo(() => {
        void version; // пересчёт при изменениях комнаты
        return getLastMessagePreview(room);
    }, [room, version]);

    // серверный счётчик O(1) — приходит из sync; локальный — только fallback
    const serverUnread = room.getRoomUnreadNotificationCount(NotificationCountType.Total);
    const needLocalCount = serverUnread == null;

    const localUnread = useMemo(() => {
        void version; // пересчёт при изменениях комнаты
        // дорогой подсчёт не запускаем вовсе, пока есть серверный счётчик
        if (!needLocalCount) return 0;
        return getLocalUnreadCount(room, myUserId);
    }, [room, myUserId, version, needLocalCount]);

    const unread = serverUnread ?? localUnread;

    return {
        roomId: room.roomId,
        name: room.name,
        avatarUrl: room.getMxcAvatarUrl() ?? null,
        lastMessage,
        unread,
        hasUnread: unread > 0,
        isMe: lastMessage?.senderId === myUserId,
        isActive,
        onClick,
    };
};
