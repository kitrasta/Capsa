// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

vi.mock('../../../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../shared/lib/matrix')>()),
    getClient: vi.fn(),
}));
vi.mock('./RoomListItemContainer', () => ({
    default: ({ room }: { room: Room }) => (
        <button data-testid="joined-room">{room.name}</button>
    ),
}));

import RoomList from './RoomList';
import { getClient } from '../../../shared/lib/matrix';

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
        currentState: { getStateEvents: () => [] },
        on: vi.fn(),
        off: vi.fn(),
    }) as unknown as Room;

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('RoomList', () => {
    it('оставляет чаты плоскими, а Spaces показывает отдельными фильтрами', () => {
        const rooms = [
            makeRoom('!group:example.org', 'Группа', 100),
            makeRoom('!space:example.org', 'Space', 400, true),
            makeRoom('!direct:example.org', 'Личный чат', 300),
            makeRoom('!channel:example.org', 'Канал', 200),
        ];
        const client = {
            getRooms: () => rooms,
            getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
            on: vi.fn(),
            off: vi.fn(),
        };
        vi.mocked(getClient).mockReturnValue(client as unknown as MatrixClient);

        render(
            <MemoryRouter initialEntries={['/chats']}>
                <RoomList />
            </MemoryRouter>,
        );

        expect(screen.getAllByTestId('joined-room').map((button) => button.textContent)).toEqual([
            'Личный чат',
            'Канал',
            'Группа',
        ]);
        expect(screen.getByRole('button', { name: 'Space' })).toBeTruthy();
    });

    it('обновляет unread другой папки, даже когда её комнаты не видимы', () => {
        let hiddenUnread = 0;
        let hiddenHandler: (() => void) | undefined;
        const visible = makeRoom('!visible:example.org', 'Видимая', 20);
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
        const rootA = makeRoom('!a:example.org', 'A', 0, true);
        const rootB = makeRoom('!b:example.org', 'B', 0, true);
        Object.defineProperty(rootA.currentState, 'getStateEvents', {
            value: () => [edge(visible.roomId)],
        });
        Object.defineProperty(rootB.currentState, 'getStateEvents', {
            value: () => [edge(hidden.roomId)],
        });
        const rooms = [visible, hidden, rootA, rootB];
        const client = {
            getRooms: () => rooms,
            getRoom: (roomId: string) => rooms.find((room) => room.roomId === roomId) ?? null,
            on: vi.fn(),
            off: vi.fn(),
        };
        vi.mocked(getClient).mockReturnValue(client as unknown as MatrixClient);

        render(<MemoryRouter initialEntries={['/chats']}><RoomList /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'A' }));

        hiddenUnread = 2;
        act(() => hiddenHandler?.());

        expect(screen.getByRole('button', { name: 'B2' })).toBeTruthy();
    });
});
