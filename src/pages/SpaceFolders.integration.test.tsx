// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
}));

vi.mock('../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../shared/lib/matrix')>()),
    getClient: mocks.getClient,
}));

import RoomList from '../widgets/Sidebar/RoomList/RoomList';

const ROOT_ID = '!root:example.org';
const CHILD_ID = '!public:example.org';
const childEvent = (): MatrixEvent => ({
    getStateKey: () => CHILD_ID,
    getContent: () => ({ via: ['example.org'] }),
}) as unknown as MatrixEvent;

const root = {
    roomId: ROOT_ID,
    name: 'Компания',
    isSpaceRoom: () => true,
    getMyMembership: () => 'join',
    getMxcAvatarUrl: () => null,
    currentState: { getStateEvents: () => [childEvent()] },
} as unknown as Room;

const LocationProbe = () => {
    const { pathname } = useLocation();
    return <output data-testid="location">{pathname}</output>;
};

describe('Space folders integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const client = {
            getRooms: () => [root],
            getRoom: (roomId: string) => roomId === ROOT_ID ? root : null,
            getUserId: () => '@me:example.org',
            getAccountData: () => null,
            on: vi.fn(),
            off: vi.fn(),
        } as unknown as MatrixClient;
        mocks.getClient.mockReturnValue(client);
    });

    afterEach(cleanup);

    it('сохраняет корневой список и ведёт из строки Space на его URL', () => {
        render(
            <MemoryRouter initialEntries={['/chats']}>
                <RoomList />
                <LocationProbe />
                <Routes>
                    <Route path="/spaces/:roomId" element={<div>Маршрут Space</div>} />
                </Routes>
            </MemoryRouter>,
        );

        const filterGroup = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filterGroup).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Все',
            'Новые',
            'Личные',
        ]);
        expect(within(filterGroup).queryByRole('button', { name: 'Компания' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'Компания' }));

        expect(screen.getByTestId('location').textContent).toBe('/spaces/!root%3Aexample.org');
        expect(screen.getByText('Маршрут Space')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Компания' })).toBeTruthy();
        expect(screen.queryByText('Публичная')).toBeNull();
    });
});
