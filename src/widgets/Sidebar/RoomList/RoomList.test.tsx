// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MatrixClient, Room } from 'matrix-js-sdk';

vi.mock('../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));
vi.mock('./RoomListItemContainer', () => ({
    default: ({ room }: { room: Room }) => <button>{room.name}</button>,
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
        on: vi.fn(),
        off: vi.fn(),
    }) as unknown as Room;

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('RoomList', () => {
    it('сразу показывает единый плоский список с общей сортировкой по активности', () => {
        const rooms = [
            makeRoom('!group:example.org', 'Группа', 100),
            makeRoom('!space:example.org', 'Space', 400, true),
            makeRoom('!direct:example.org', 'Личный чат', 300),
            makeRoom('!channel:example.org', 'Канал', 200),
        ];
        const client = {
            getRooms: () => rooms,
            on: vi.fn(),
            off: vi.fn(),
        };
        vi.mocked(getClient).mockReturnValue(client as unknown as MatrixClient);

        render(
            <MemoryRouter initialEntries={['/chats']}>
                <RoomList />
            </MemoryRouter>,
        );

        expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Личный чат',
            'Канал',
            'Группа',
        ]);
        expect(screen.queryByText('Space')).toBeNull();
    });
});
