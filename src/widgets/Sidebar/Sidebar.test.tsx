// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { IPublicRoomsChunkRoom } from 'matrix-js-sdk';

vi.mock('../../shared/lib/matrix', () => ({
    searchPublicRooms: vi.fn(),
    searchUsers: vi.fn(),
    joinRoom: vi.fn(),
    createDirectChat: vi.fn(),
}));

vi.mock('./RoomList/RoomList', () => ({ default: () => null }));
vi.mock('./Navbar/Navbar', () => ({ default: () => null }));
vi.mock('../CreateChat/CreateChatModal', () => ({ default: () => null }));

import Sidebar from './Sidebar';
import { searchPublicRooms, searchUsers } from '../../shared/lib/matrix';

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

const room = (id: string, name: string): IPublicRoomsChunkRoom =>
    ({ room_id: id, name, num_joined_members: 1 }) as IPublicRoomsChunkRoom;

const renderSidebar = () =>
    render(
        <MemoryRouter initialEntries={['/chats']}>
            <Sidebar />
        </MemoryRouter>,
    );

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(searchUsers).mockResolvedValue([]);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('Sidebar: гонки поиска', () => {
    it('не позволяет старому ответу перезаписать результаты нового запроса', async () => {
        const alex = deferred<IPublicRoomsChunkRoom[]>();
        const bob = deferred<IPublicRoomsChunkRoom[]>();
        vi.mocked(searchPublicRooms)
            .mockImplementationOnce(() => alex.promise)
            .mockImplementationOnce(() => bob.promise);
        renderSidebar();
        const input = screen.getByPlaceholderText('Search');

        fireEvent.change(input, { target: { value: 'alex' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.change(input, { target: { value: 'bob' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        await act(async () => {
            bob.resolve([room('!bob:example.org', 'Bob room')]);
            await Promise.resolve();
        });
        expect(screen.getByText('Bob room')).toBeTruthy();

        await act(async () => {
            alex.resolve([room('!alex:example.org', 'Alex room')]);
            await Promise.resolve();
        });
        expect(screen.getByText('Bob room')).toBeTruthy();
        expect(screen.queryByText('Alex room')).toBeNull();
    });

    it('не возвращает результаты после очистки поля', async () => {
        const pending = deferred<IPublicRoomsChunkRoom[]>();
        vi.mocked(searchPublicRooms).mockImplementation(() => pending.promise);
        renderSidebar();
        const input = screen.getByPlaceholderText('Search');

        fireEvent.change(input, { target: { value: 'alex' } });
        await act(async () => {
            vi.advanceTimersByTime(500);
        });
        fireEvent.change(input, { target: { value: '' } });

        await act(async () => {
            pending.resolve([room('!alex:example.org', 'Alex room')]);
            await Promise.resolve();
        });

        expect(screen.queryByText('Alex room')).toBeNull();
    });
});
