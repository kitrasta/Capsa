import { RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { IRoomTimelineData } from 'matrix-js-sdk/lib/models/event-timeline-set';

const MESSAGES_KEY = 'capsa.notifications.messages';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export const getMessageNotificationsEnabled = (): boolean => {
    try {
        return localStorage.getItem(MESSAGES_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setMessageNotificationsEnabled = (enabled: boolean): void => {
    try {
        localStorage.setItem(MESSAGES_KEY, String(enabled));
    } catch {
        // Настройка просто не сохранится; текущий UI продолжит работать.
    }
};

export const getBrowserNotificationPermission = (): BrowserNotificationPermission => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
};

export const requestBrowserNotificationPermission = async (): Promise<BrowserNotificationPermission> => {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
        return await Notification.requestPermission();
    } catch {
        return Notification.permission;
    }
};

export const showBrowserNotification = (
    title: string,
    body: string,
): Notification | null => {
    if (getBrowserNotificationPermission() !== 'granted') return null;
    try {
        const notification = new Notification(title, { body });
        notification.onclick = () => window.focus();
        return notification;
    } catch {
        return null;
    }
};

/** Подписка только на живые сообщения; старая синхронизация не уведомляет. */
export const subscribeToMessageNotifications = (client: MatrixClient): (() => void) => {
    const handleTimeline = (
        event: MatrixEvent,
        room: Room | undefined,
        _toStartOfTimeline: boolean | undefined,
        removed: boolean,
        data: IRoomTimelineData,
    ): void => {
        if (
            removed ||
            !data.liveEvent ||
            !document.hidden ||
            !getMessageNotificationsEnabled() ||
            getBrowserNotificationPermission() !== 'granted' ||
            event.getType() !== 'm.room.message' ||
            event.getSender() === client.getUserId()
        ) {
            return;
        }

        const content = event.getContent();
        showBrowserNotification(
            room?.name || event.getSender() || 'Capsa',
            typeof content.body === 'string' && content.body.trim()
                ? content.body
                : 'Новое сообщение',
        );
    };

    client.on(RoomEvent.Timeline, handleTimeline);
    return () => {
        client.off(RoomEvent.Timeline, handleTimeline);
    };
};
