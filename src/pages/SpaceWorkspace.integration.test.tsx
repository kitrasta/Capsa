// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { ClientEvent, EventType, NotificationCountType } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { RoomAccess, SpaceChildSummary } from '../shared/lib/matrix';

const SPACE_ID = '!space:example.org';
const JOINED_ID = '!joined:example.org';
const PUBLIC_ID = '!public:example.org';
const NESTED_ID = '!nested:example.org';
const DEEP_NESTED_ID = '!deep-nested:example.org';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getSession: vi.fn(),
    getSpaceChildSummaries: vi.fn(),
    getRoomAccess: vi.fn(),
    joinRoom: vi.fn(),
    otkState: { conflict: false },
    matrixLifecycle: {
        subscribe: vi.fn(),
        getState: vi.fn(),
        start: vi.fn(),
    },
}));

vi.mock('../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../shared/lib/matrix')>()),
    getClient: mocks.getClient,
    getSession: mocks.getSession,
    getSpaceChildSummaries: mocks.getSpaceChildSummaries,
    getRoomAccess: mocks.getRoomAccess,
    joinRoom: mocks.joinRoom,
    cleanupLegacyCryptoStore: vi.fn(() => Promise.resolve()),
    matrixLifecycle: mocks.matrixLifecycle,
    otkConflict: {
        getState: vi.fn(() => mocks.otkState),
        subscribe: vi.fn(() => () => undefined),
    },
}));

vi.mock('../shared/lib/notifications', () => ({
    subscribeToMessageNotifications: vi.fn(() => () => undefined),
}));

vi.mock('../widgets/EncryptionRecovery/EncryptionRecovery', () => ({
    default: () => null,
}));

vi.mock('../widgets/Sidebar/Sidebar', () => ({
    default: () => <RoomList />,
}));

vi.mock('../widgets/Chat/ChatView', () => {
    const MockChatView = ({ backTo, backState }: { backTo?: string; backState?: unknown }) => {
        const navigate = useNavigate();
        return (
            <div>
                <button
                    type="button"
                    aria-label={backTo ? 'Назад к обзору пространства' : 'Назад к списку чатов'}
                    onClick={() => navigate(backTo ?? '/chats', { state: backState })}
                />
                <textarea aria-label="Сообщение" />
            </div>
        );
    };
    return { default: MockChatView };
});

import AppRouter from '../app/router/app-router';
import RoomList from '../widgets/Sidebar/RoomList/RoomList';

const childEvent = (childId: string): MatrixEvent => ({
    getStateKey: () => childId,
    getContent: () => ({ via: ['example.org'] }),
}) as unknown as MatrixEvent;

const topicEvent = (topic: string): MatrixEvent => ({
    getContent: () => ({ topic }),
}) as unknown as MatrixEvent;

interface RoomOptions {
    space?: boolean;
    membership?: string;
    children?: string[];
    topic?: string;
    timestamp?: number;
    unread?: number;
    memberCount?: number;
}

const makeRoom = (roomId: string, name: string, options: RoomOptions = {}): Room => ({
    roomId,
    name,
    isSpaceRoom: () => options.space === true,
    getMyMembership: () => options.membership ?? 'join',
    getLastActiveTimestamp: () => options.timestamp ?? 0,
    getRoomUnreadNotificationCount: (type: NotificationCountType) => (
        type === NotificationCountType.Total ? options.unread ?? 0 : 0
    ),
    getJoinedMemberCount: () => options.memberCount ?? 0,
    getMxcAvatarUrl: () => null,
    on: vi.fn(),
    off: vi.fn(),
    currentState: {
        getStateEvents: (eventType: string) => {
            if (eventType === EventType.SpaceChild) {
                return (options.children ?? []).map(childEvent);
            }
            if (eventType === EventType.RoomTopic) {
                return options.topic ? topicEvent(options.topic) : null;
            }
            return [];
        },
    },
} as unknown as Room);

const summary = (name: string, options: Partial<SpaceChildSummary> = {}): SpaceChildSummary => ({
    name,
    avatarUrl: null,
    roomType: null,
    joinRule: 'public',
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 4,
    ...options,
});

const access = (kind: RoomAccess['kind']): RoomAccess => ({
    kind,
    summary: kind === 'public' ? summary('Публичная') : null,
});

const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.pathname}</output>;
};

const renderRoute = (initialEntry: string, state?: unknown) => render(
    <MemoryRouter initialEntries={[{ pathname: initialEntry, state }]}>
        <AppRouter />
        <LocationProbe />
    </MemoryRouter>,
);

const spacePath = (spaceId = SPACE_ID) => `/spaces/${encodeURIComponent(spaceId)}`;
const roomPath = (roomId = JOINED_ID, spaceId = SPACE_ID) => (
    `${spacePath(spaceId)}/chats/${encodeURIComponent(roomId)}`
);

describe('Space workspace routes', () => {
    const listeners = new Map<string, Set<() => void>>();
    const emitClientEvent = (event: string) => {
        listeners.get(event)?.forEach((listener) => listener());
    };

    beforeEach(() => {
        vi.clearAllMocks();
        listeners.clear();
        const rooms = [
            makeRoom(SPACE_ID, 'Компания', {
                space: true,
                children: [JOINED_ID, PUBLIC_ID, NESTED_ID],
                topic: 'Рабочее пространство команды',
                memberCount: 12,
            }),
            makeRoom(JOINED_ID, 'Общий', { timestamp: 20, unread: 3 }),
            makeRoom(NESTED_ID, 'Разработка', {
                space: true,
                children: [DEEP_NESTED_ID],
            }),
            makeRoom(DEEP_NESTED_ID, 'Платформа', { space: true }),
        ];
        const client = {
            getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
            getRooms: () => rooms,
            getUserId: () => '@me:example.org',
            getAccountData: () => null,
            getSyncState: () => null,
            stopPeeking: vi.fn(),
            on: vi.fn((event: string, listener: () => void) => {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event)!.add(listener);
            }),
            off: vi.fn((event: string, listener: () => void) => {
                listeners.get(event)?.delete(listener);
            }),
        } as unknown as MatrixClient;
        mocks.getClient.mockReturnValue(client);
        mocks.getSession.mockReturnValue({
            accessToken: 'token',
            userId: '@me:example.org',
            deviceId: 'DEVICE',
            homeserverUrl: 'https://matrix.example.org',
            serverName: 'example.org',
        });
        mocks.matrixLifecycle.getState.mockReturnValue({ state: 'client ready', error: null });
        mocks.matrixLifecycle.subscribe.mockReturnValue(() => undefined);
        mocks.matrixLifecycle.start.mockResolvedValue(undefined);
        mocks.getSpaceChildSummaries.mockImplementation((spaceId: string) => Promise.resolve(
            spaceId === SPACE_ID
                ? new Map([[PUBLIC_ID, summary('Публичная')]])
                : new Map(),
        ));
        mocks.getRoomAccess.mockImplementation((roomId: string) => Promise.resolve(
            access(roomId === JOINED_ID ? 'joined' : 'public'),
        ));
        mocks.joinRoom.mockResolvedValue(makeRoom(PUBLIC_ID, 'Публичная'));
    });

    afterEach(cleanup);

    it('completes the root-to-Space journey with public join and joined-room switching', async () => {
        renderRoute('/chats');

        const filterGroup = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filterGroup).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Все',
            'Новые',
            'Личные',
        ]);
        expect(within(filterGroup).queryByRole('button', { name: 'Компания' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Компания 3' }));

        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        fireEvent.click(within(overview).getByRole('button', { name: /Публичная/ }));

        expect(await screen.findByRole('button', { name: 'Вступить в комнату' })).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(roomPath(PUBLIC_ID));
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Вступить в комнату' }));

        await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith(PUBLIC_ID));
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
        mocks.getRoomAccess.mockResolvedValue(access('joined'));
        await act(async () => emitClientEvent(ClientEvent.Room));
        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();
        const navigation = screen.getByRole('navigation', { name: 'Навигация по пространству' });
        fireEvent.click(within(navigation).getByRole('button', { name: /Общий/ }));

        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(roomPath());

        fireEvent.click(screen.getByRole('button', { name: 'Обзор пространства' }));

        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
    });

    it('shows only joined children in the sidebar and every direct child in the overview', async () => {
        renderRoute(spacePath());

        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
        expect(screen.getAllByText('Компания')).not.toHaveLength(0);
        const navigation = screen.getByRole('navigation', { name: 'Навигация по пространству' });
        expect(within(navigation).getByRole('button', { name: /Общий/ })).toBeTruthy();
        expect(within(navigation).getByRole('button', { name: /Разработка/ })).toBeTruthy();
        expect(within(navigation).queryByRole('button', { name: /Публичная/ })).toBeNull();

        const overview = screen.getByRole('region', { name: 'Обзор пространства' });
        expect(within(overview).getByRole('button', { name: /Общий/ })).toBeTruthy();
        expect(within(overview).getByRole('button', { name: /Публичная/ })).toBeTruthy();
        expect(within(overview).getByRole('button', { name: /Разработка/ })).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
    });

    it('opens a joined room with its composer and returns to the catalog', async () => {
        renderRoute(spacePath());
        const navigation = await screen.findByRole('navigation', { name: 'Навигация по пространству' });

        fireEvent.click(within(navigation).getByRole('button', { name: /Общий/ }));

        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(roomPath());

        fireEvent.click(screen.getByRole('button', { name: 'Обзор пространства' }));

        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
    });

    it('opens a public child in the existing access gate without a composer', async () => {
        renderRoute(spacePath());
        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });

        fireEvent.click(within(overview).getByRole('button', { name: /Публичная/ }));

        expect(await screen.findByRole('button', { name: 'Вступить в комнату' })).toBeTruthy();
        expect(screen.getByTestId('location').textContent).toBe(roomPath(PUBLIC_ID));
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
        const main = screen.getByRole('main');
        expect(within(main).getAllByRole('button', {
            name: 'Назад к обзору пространства',
        })).toHaveLength(1);
        expect(within(main).queryByRole('button', { name: 'Назад к списку чатов' })).toBeNull();

        fireEvent.click(within(main).getByRole('button', {
            name: 'Назад к обзору пространства',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
    });

    it('preserves ancestry through A to B to C and back to B to A', async () => {
        renderRoute(spacePath());
        const rootOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(rootOverview).getByRole('button', { name: /Разработка/ }));

        const nestedOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(nestedOverview).getByRole('button', { name: /Платформа/ }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath(DEEP_NESTED_ID));

        let currentOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(currentOverview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath(NESTED_ID));

        currentOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(currentOverview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
    });

    it('returns from an unavailable nested Space to its actual parent', async () => {
        const client = mocks.getClient() as MatrixClient;
        const nested = client.getRoom(NESTED_ID)!;
        nested.getMyMembership = () => 'leave';
        renderRoute(spacePath());
        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });

        fireEvent.click(within(overview).getByRole('button', { name: /Разработка/ }));

        const unavailableOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(within(unavailableOverview).getByText('Пространство недоступно')).toBeTruthy();
        fireEvent.click(within(unavailableOverview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));

        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
    });

    it('preserves ancestry through an unavailable deep nested Space', async () => {
        const client = mocks.getClient() as MatrixClient;
        const deepNested = client.getRoom(DEEP_NESTED_ID)!;
        deepNested.getMyMembership = () => 'leave';
        renderRoute(spacePath());
        const rootOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(rootOverview).getByRole('button', { name: /Разработка/ }));
        const nestedOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(nestedOverview).getByRole('button', { name: /Платформа/ }));

        let currentOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(within(currentOverview).getByText('Пространство недоступно')).toBeTruthy();
        fireEvent.click(within(currentOverview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath(NESTED_ID));

        currentOverview = await screen.findByRole('region', { name: 'Обзор пространства' });
        fireEvent.click(within(currentOverview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
    });

    it('retains Space and room context on a direct room URL', async () => {
        renderRoute(roomPath());

        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();
        const navigation = screen.getByRole('navigation', { name: 'Навигация по пространству' });
        expect(within(navigation).getAllByText('Компания')).not.toHaveLength(0);
        expect(
            within(navigation).getByRole('button', { name: /Общий/ }).getAttribute('aria-current'),
        ).toBe('page');
    });

    it('blocks room access on a direct URL for a missing Space and returns to root', async () => {
        renderRoute(roomPath(JOINED_ID, '!missing:example.org'));

        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(within(overview).getByText('Пространство недоступно')).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
        expect(mocks.getRoomAccess).not.toHaveBeenCalled();

        fireEvent.click(within(overview).getByRole('button', { name: 'Все чаты' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/chats'));
    });

    it('blocks room access for a newly left Space and returns to its parent', async () => {
        const client = mocks.getClient() as MatrixClient;
        const nested = client.getRoom(NESTED_ID)!;
        nested.getMyMembership = () => 'leave';
        renderRoute(roomPath(JOINED_ID, NESTED_ID), {
            parentSpaceId: SPACE_ID,
            spaceAncestry: [SPACE_ID],
        });

        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(within(overview).getByText('Пространство недоступно')).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
        expect(mocks.getRoomAccess).not.toHaveBeenCalled();

        fireEvent.click(within(overview).getByRole('button', {
            name: 'Назад к родительскому пространству',
        }));
        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
    });

    it('returns from a room to its Space overview on mobile', async () => {
        renderRoute(roomPath());
        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();

        const main = screen.getByRole('main');
        expect(within(main).getAllByRole('button', {
            name: 'Назад к обзору пространства',
        })).toHaveLength(1);
        expect(within(main).queryByRole('button', { name: 'Назад к списку чатов' })).toBeNull();
        fireEvent.click(within(main).getByRole('button', {
            name: 'Назад к обзору пространства',
        }));

        expect(screen.getByTestId('location').textContent).toBe(spacePath());
        expect(await screen.findByText('Рабочее пространство команды')).toBeTruthy();
    });

    it('shows an unavailable state and no composer for a missing Space', async () => {
        renderRoute(spacePath('!missing:example.org'));

        const overview = await screen.findByRole('region', { name: 'Обзор пространства' });
        expect(within(overview).getByText('Пространство недоступно')).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Назад к списку чатов' }));
        await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/chats'));
    });
});
