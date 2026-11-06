// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getSpaceChildSummaries: vi.fn(),
}));

vi.mock('../../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../shared/lib/matrix')>()),
    getClient: mocks.getClient,
    getSpaceChildSummaries: mocks.getSpaceChildSummaries,
}));
vi.mock('./RoomListItemContainer', () => ({
    default: ({ room }: { room: Room }) => (
        <button data-testid="joined-room">{room.name}</button>
    ),
}));

import RoomList from './RoomList';

const makeRoom = (
    roomId: string,
    name: string,
    timestamp: number,
    isSpace = false,
): Room =>
    ({
        roomId,
        name,
        isSpaceRoom: () => isSpace,
        getMyMembership: () => 'join',
        getLastActiveTimestamp: () => timestamp,
        getMxcAvatarUrl: () => null,
        getRoomUnreadNotificationCount: () => 0,
        getMember: () => undefined,
        getMembers: () => [],
        currentState: { getStateEvents: () => [] },
        on: vi.fn(),
        off: vi.fn(),
    }) as unknown as Room;

const setupClient = (rooms: Room[]) => {
    const client = {
        getRooms: () => rooms,
        getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
        getUserId: () => '@me:example.org',
        getAccountData: () => null,
        on: vi.fn(),
        off: vi.fn(),
    };
    mocks.getClient.mockReturnValue(client as unknown as MatrixClient);
    mocks.getSpaceChildSummaries.mockResolvedValue(new Map());
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('RoomList', () => {
    it('показывает постоянные фильтры и Space как строку в общем списке, а не вкладку', () => {
        const group = makeRoom('!group:example.org', 'Группа', 100);
        const space = makeRoom('!space:example.org', 'Space', 0, true);
        const edge = (roomId: string): MatrixEvent => ({
            getStateKey: () => roomId,
            getContent: () => ({ via: ['example.org'] }),
        }) as unknown as MatrixEvent;
        Object.defineProperty(space.currentState, 'getStateEvents', {
            value: () => [edge(group.roomId)],
        });
        const direct = makeRoom('!direct:example.org', 'Личный чат', 300);
        const channel = makeRoom('!channel:example.org', 'Канал', 200);
        setupClient([group, space, direct, channel]);

        render(
            <MemoryRouter initialEntries={['/chats']}>
                <RoomList />
            </MemoryRouter>,
        );

        const filters = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filters).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Все',
            'Новые',
            'Личные',
        ]);
        expect(within(filters).queryByRole('button', { name: 'Space' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Space' })).toBeTruthy();
        expect(screen.getAllByTestId('joined-room').map((button) => button.textContent)).toEqual([
            'Личный чат',
            'Канал',
        ]);
        expect(screen.queryByText('Группа')).toBeNull();
    });

    it('обновляет aggregate unread скрытого Space и показывает его в фильтре Новые', () => {
        let hiddenUnread = 0;
        let hiddenHandler: (() => void) | undefined;
        const hidden = makeRoom('!hidden:example.org', 'Скрытая', 10);
        hidden.getRoomUnreadNotificationCount = () => hiddenUnread;
        hidden.on = vi.fn((event: string, handler: () => void) => {
            if (event === RoomEvent.UnreadNotifications) hiddenHandler = handler;
        }) as never;
        hidden.off = vi.fn((event: string, handler: () => void) => {
            if (event === RoomEvent.UnreadNotifications && hiddenHandler === handler) {
                hiddenHandler = undefined;
            }
        }) as never;
        const edge = (roomId: string): MatrixEvent => ({
            getStateKey: () => roomId,
            getContent: () => ({ via: ['example.org'] }),
        }) as unknown as MatrixEvent;
        const root = makeRoom('!root:example.org', 'Сообщество', 0, true);
        Object.defineProperty(root.currentState, 'getStateEvents', {
            value: () => [edge(hidden.roomId)],
        });
        setupClient([hidden, root]);

        render(<MemoryRouter initialEntries={['/chats']}><RoomList /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Новые' }));
        expect(screen.queryByRole('button', { name: /Сообщество/ })).toBeNull();

        hiddenUnread = 2;
        act(() => hiddenHandler?.());

        expect(screen.getByRole('button', { name: 'Сообщество 2' })).toBeTruthy();
    });

    it('при выборе Space заменяет список его непосредственными детьми и показывает путь', () => {
        const child = makeRoom('!child:example.org', 'Дочерняя', 20);
        const outside = makeRoom('!outside:example.org', 'Снаружи', 30);
        const root = makeRoom('!root:example.org', 'Компания', 0, true);
        const edge = (roomId: string): MatrixEvent => ({
            getStateKey: () => roomId,
            getContent: () => ({ via: ['example.org'] }),
        }) as unknown as MatrixEvent;
        Object.defineProperty(root.currentState, 'getStateEvents', {
            value: () => [edge(child.roomId)],
        });
        setupClient([root, child, outside]);

        render(<MemoryRouter initialEntries={['/chats']}><RoomList /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Компания' }));

        expect(screen.getAllByTestId('joined-room').map((button) => button.textContent)).toEqual([
            'Дочерняя',
        ]);
        expect(screen.queryByText('Снаружи')).toBeNull();
        expect(screen.getByRole('navigation', { name: 'Путь' }).textContent).toBe('Все/Компания');
    });
});
