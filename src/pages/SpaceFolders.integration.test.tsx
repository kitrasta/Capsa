// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ClientEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { RoomAccess, SpaceChildSummary } from '../shared/lib/matrix';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getSpaceChildSummaries: vi.fn(),
    getRoomAccess: vi.fn(),
    joinRoom: vi.fn(),
    knockRoom: vi.fn(),
    emitRoom: vi.fn<() => Promise<void>>(),
}));

vi.mock('../shared/lib/matrix', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../shared/lib/matrix')>()),
    getClient: mocks.getClient,
    getSpaceChildSummaries: mocks.getSpaceChildSummaries,
    getRoomAccess: mocks.getRoomAccess,
    joinRoom: mocks.joinRoom,
    knockRoom: mocks.knockRoom,
}));

vi.mock('../widgets/Chat/ChatView', () => ({
    default: () => <textarea aria-label="Сообщение" />,
}));

import RoomList from '../widgets/Sidebar/RoomList/RoomList';
import ChatsPage from './ChatsPage';

const ROOT_ID = '!root:example.org';
const PUBLIC_ID = '!public:example.org';
const childEvent = (): MatrixEvent => ({
    getStateKey: () => PUBLIC_ID,
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

const publicSummary: SpaceChildSummary = {
    name: 'Публичная',
    avatarUrl: null,
    roomType: null,
    joinRule: 'public',
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 3,
};

const publicAccess: RoomAccess = { kind: 'public', summary: publicSummary };

describe('Space folders integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const listeners = new Map<string, Set<() => void>>();
        const client = {
            getRooms: () => [root],
            getRoom: (roomId: string) => roomId === ROOT_ID ? root : null,
            getUserId: () => '@me:example.org',
            getAccountData: () => null,
            on: vi.fn((event: string, listener: () => void) => {
                if (!listeners.has(event)) listeners.set(event, new Set());
                listeners.get(event)!.add(listener);
            }),
            off: vi.fn((event: string, listener: () => void) => {
                listeners.get(event)?.delete(listener);
            }),
            stopPeeking: vi.fn(),
        } as unknown as MatrixClient;
        mocks.getClient.mockReturnValue(client);
        mocks.getSpaceChildSummaries.mockResolvedValue(new Map([[PUBLIC_ID, publicSummary]]));
        mocks.getRoomAccess.mockResolvedValue(publicAccess);
        mocks.joinRoom.mockResolvedValue({ roomId: PUBLIC_ID });

        mocks.emitRoom.mockImplementation(async () => {
            await act(async () => {
                listeners.get(ClientEvent.Room)?.forEach((listener) => listener());
            });
        });
    });

    afterEach(cleanup);

    it('ведёт от Space-контейнера через постоянные фильтры к обычному composer после вступления', async () => {
        render(
            <MemoryRouter initialEntries={['/chats']}>
                <RoomList />
                <Routes>
                    <Route path="/chats" element={<div>Пустой чат</div>} />
                    <Route path="/chats/:roomId" element={<ChatsPage />} />
                </Routes>
            </MemoryRouter>,
        );

        // Постоянные фильтры; Space — строка-контейнер, а не верхняя вкладка.
        const filterGroup = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filterGroup).getByRole('button', { name: 'Все' })
            .getAttribute('aria-pressed')).toBe('true');
        expect(within(filterGroup).queryByRole('button', { name: 'Компания' })).toBeNull();

        // Открываем контейнер: список заменяется его детьми.
        fireEvent.click(screen.getByRole('button', { name: 'Компания' }));
        expect(await screen.findByText('Публичная')).toBeTruthy();

        // «Новые» и «Личные» прячут unjoined комнату без непрочитанных и DM-связи.
        fireEvent.click(within(filterGroup).getByRole('button', { name: 'Новые' }));
        expect(screen.queryByText('Публичная')).toBeNull();
        fireEvent.click(within(filterGroup).getByRole('button', { name: 'Личные' }));
        expect(screen.queryByText('Публичная')).toBeNull();

        // «Все» возвращает детей контейнера.
        fireEvent.click(within(filterGroup).getByRole('button', { name: 'Все' }));
        expect(screen.getByText('Публичная')).toBeTruthy();

        // Открываем unjoined child, вступаем из footer и сразу получаем
        // обычный composer — без второго перехода по навигации.
        fireEvent.click(screen.getByText('Публичная'));
        fireEvent.click(await screen.findByRole('button', { name: 'Вступить в комнату' }));

        expect(mocks.joinRoom).toHaveBeenCalledWith(PUBLIC_ID);
        mocks.getRoomAccess.mockResolvedValue({ kind: 'joined', summary: publicSummary });
        await mocks.emitRoom();

        expect(await screen.findByRole('textbox', { name: 'Сообщение' })).toBeTruthy();
    });
});
