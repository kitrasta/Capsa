// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import {
    getMessageNotificationsEnabled,
    setMessageNotificationsEnabled,
    subscribeToMessageNotifications,
} from './notifications';

class NotificationMock {
    static permission: NotificationPermission = 'granted';
    static instances: NotificationMock[] = [];
    onclick: (() => void) | null = null;

    constructor(
        public title: string,
        public options?: NotificationOptions,
    ) {
        NotificationMock.instances.push(this);
    }
}

type TimelineHandler = (
    event: {
        getType(): string;
        getSender(): string;
        getContent(): { body?: unknown };
    },
    room: { name: string } | undefined,
    toStartOfTimeline: boolean | undefined,
    removed: boolean,
    data: { liveEvent?: boolean },
) => void;

const makeClient = () => {
    let timelineHandler: TimelineHandler | undefined;
    return {
        client: {
            getUserId: () => '@me:example.org',
            on: vi.fn((event: string, handler: TimelineHandler) => {
                if (event === RoomEvent.Timeline) timelineHandler = handler;
            }),
            off: vi.fn((event: string, handler: TimelineHandler) => {
                if (event === RoomEvent.Timeline && timelineHandler === handler) {
                    timelineHandler = undefined;
                }
            }),
        } as unknown as MatrixClient,
        emit: (options?: {
            sender?: string;
            type?: string;
            liveEvent?: boolean;
            removed?: boolean;
        }) => timelineHandler?.(
            {
                getType: () => options?.type ?? 'm.room.message',
                getSender: () => options?.sender ?? '@alice:example.org',
                getContent: () => ({ body: 'Привет' }),
            },
            { name: 'Общий чат' },
            false,
            options?.removed ?? false,
            { liveEvent: options?.liveEvent ?? true },
        ),
        hasHandler: () => timelineHandler !== undefined,
    };
};

describe('message notifications', () => {
    beforeEach(() => {
        localStorage.clear();
        NotificationMock.instances = [];
        NotificationMock.permission = 'granted';
        vi.stubGlobal('Notification', NotificationMock);
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('выключена по умолчанию и игнорирует повреждённое значение', () => {
        expect(getMessageNotificationsEnabled()).toBe(false);
        localStorage.setItem('capsa.notifications.messages', 'yes');
        expect(getMessageNotificationsEnabled()).toBe(false);

        setMessageNotificationsEnabled(true);
        expect(getMessageNotificationsEnabled()).toBe(true);
    });

    it('показывает live-сообщение другого автора в скрытой вкладке', () => {
        setMessageNotificationsEnabled(true);
        const { client, emit } = makeClient();
        subscribeToMessageNotifications(client);

        emit();

        expect(NotificationMock.instances).toHaveLength(1);
        expect(NotificationMock.instances[0].title).toBe('Общий чат');
        expect(NotificationMock.instances[0].options?.body).toBe('Привет');
    });

    it('не уведомляет о собственных, старых, удалённых и не-message событиях', () => {
        setMessageNotificationsEnabled(true);
        const { client, emit } = makeClient();
        subscribeToMessageNotifications(client);

        emit({ sender: '@me:example.org' });
        emit({ liveEvent: false });
        emit({ removed: true });
        emit({ type: 'm.reaction' });

        expect(NotificationMock.instances).toHaveLength(0);
    });

    it('не уведомляет в видимой вкладке и после отписки', () => {
        setMessageNotificationsEnabled(true);
        const { client, emit, hasHandler } = makeClient();
        const unsubscribe = subscribeToMessageNotifications(client);

        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        emit();
        expect(NotificationMock.instances).toHaveLength(0);

        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        unsubscribe();
        emit();
        expect(hasHandler()).toBe(false);
        expect(NotificationMock.instances).toHaveLength(0);
    });
});
