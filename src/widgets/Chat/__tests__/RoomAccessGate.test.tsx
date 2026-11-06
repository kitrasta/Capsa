// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClientEvent, RoomEvent } from 'matrix-js-sdk';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import type { RoomAccess, SpaceChildSummary } from '../../../shared/lib/matrix';

const mocks = vi.hoisted(() => ({
    getClient: vi.fn(),
    getRoomAccess: vi.fn(),
    joinRoom: vi.fn(),
    knockRoom: vi.fn(),
    navigate: vi.fn(),
    chatView: vi.fn(),
}));

vi.mock('../../../shared/lib/matrix', () => ({
    getClient: mocks.getClient,
    getRoomAccess: mocks.getRoomAccess,
    joinRoom: mocks.joinRoom,
    knockRoom: mocks.knockRoom,
    canPeekRoom: (summary: SpaceChildSummary | null) => summary?.worldReadable === true,
}));

vi.mock('../ChatView', () => ({
    default: (props: { roomId: string; backTo?: string; backState?: unknown }) => {
        mocks.chatView(props);
        return <div data-testid="joined-chat">{props.roomId}</div>;
    },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

import RoomAccessGate from '../RoomAccessGate';

const summary = (extra: Partial<SpaceChildSummary> = {}): SpaceChildSummary => ({
    name: 'Публичная комната',
    avatarUrl: null,
    roomType: null,
    joinRule: 'public',
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 5,
    ...extra,
});

const access = (kind: RoomAccess['kind'], extra: Partial<SpaceChildSummary> = {}): RoomAccess => ({
    kind,
    summary: summary(extra),
});

const listeners = new Map<string, Set<() => void>>();
const peekInRoom = vi.fn();
const stopPeeking = vi.fn();
const client = {
    on: vi.fn((event: string, listener: () => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(listener);
    }),
    off: vi.fn((event: string, listener: () => void) => listeners.get(event)?.delete(listener)),
    peekInRoom,
    stopPeeking,
} as unknown as MatrixClient;

const emit = (event: string) => {
    listeners.get(event)?.forEach((listener) => listener());
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('RoomAccessGate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listeners.clear();
        mocks.getClient.mockReturnValue(client);
        mocks.joinRoom.mockResolvedValue({ roomId: '!room:example.org' });
        mocks.knockRoom.mockResolvedValue(undefined);
    });

    afterEach(cleanup);

    it('показывает loading до классификации и не монтирует composer', () => {
        mocks.getRoomAccess.mockReturnValue(new Promise(() => undefined));

        render(<RoomAccessGate roomId="!room:example.org" />);

        expect(screen.getByText('Загрузка комнаты…')).toBeTruthy();
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
    });

    it('передаёт joined room в существующий ChatView', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('joined'));

        render(<RoomAccessGate roomId="!room:example.org" />);

        expect((await screen.findByTestId('joined-chat')).textContent).toBe('!room:example.org');
    });

    it('передаёт route-aware back destination и state в joined ChatView', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('joined'));
        const backState = { spaceAncestry: ['!space:example.org'] };

        render(
            <RoomAccessGate
                roomId="!room:example.org"
                backTo="/spaces/!space%3Aexample.org"
                backState={backState}
            />,
        );

        await screen.findByTestId('joined-chat');
        expect(mocks.chatView.mock.calls.at(-1)?.[0]).toMatchObject({
            roomId: '!room:example.org',
            backTo: '/spaces/!space%3Aexample.org',
            backState,
        });
    });

    it('использует route-aware back destination в access header', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('public'));
        const backState = { spaceAncestry: ['!space:example.org'] };
        render(
            <RoomAccessGate
                roomId="!room:example.org"
                backTo="/spaces/!space%3Aexample.org"
                backState={backState}
            />,
        );

        fireEvent.click(await screen.findByRole('button', {
            name: 'Назад к обзору пространства',
        }));
        expect(mocks.navigate).toHaveBeenCalledWith('/spaces/!space%3Aexample.org', {
            state: backState,
        });
    });

    it('вступает в public комнату из footer и после sync показывает ChatView', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('public'));
        render(<RoomAccessGate roomId="!room:example.org" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Вступить в комнату' }));
        await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith('!room:example.org'));
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();

        mocks.getRoomAccess.mockResolvedValue(access('joined'));
        await act(async () => emit(ClientEvent.Room));
        expect(await screen.findByTestId('joined-chat')).toBeTruthy();
    });

    it('принимает приглашение через join API', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('invited', { joinRule: 'invite' }));
        render(<RoomAccessGate roomId="!room:example.org" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Принять приглашение' }));

        await waitFor(() => expect(mocks.joinRoom).toHaveBeenCalledWith('!room:example.org'));
    });

    it('отправляет knock и меняет footer на ожидание', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('knock', { joinRule: 'knock' }));
        render(<RoomAccessGate roomId="!room:example.org" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Запросить доступ' }));

        await waitFor(() => expect(mocks.knockRoom).toHaveBeenCalledWith('!room:example.org'));
        expect(await screen.findByText('Запрос на доступ отправлен')).toBeTruthy();
    });

    it('различает invite-only, ожидание knock и отсутствие доступа', async () => {
        mocks.getRoomAccess.mockResolvedValueOnce(access('invite-only', { joinRule: 'invite' }));
        const view = render(<RoomAccessGate roomId="!invite:example.org" />);
        expect(await screen.findByText('Вступление по приглашению')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Вступить в комнату' })).toBeNull();

        mocks.getRoomAccess.mockResolvedValueOnce(access('knock-pending', { joinRule: 'knock' }));
        view.rerender(<RoomAccessGate roomId="!knock:example.org" />);
        expect(await screen.findByText('Запрос на доступ отправлен')).toBeTruthy();

        mocks.getRoomAccess.mockResolvedValueOnce({ kind: 'inaccessible', summary: null });
        view.rerender(<RoomAccessGate roomId="!denied:example.org" />);
        expect(await screen.findByText('Нет доступа к этой комнате')).toBeTruthy();
    });

    it('показывает ошибку действия и не открывает composer', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('public'));
        mocks.joinRoom.mockRejectedValue(new Error('network'));
        render(<RoomAccessGate roomId="!room:example.org" />);

        fireEvent.click(await screen.findByRole('button', { name: 'Вступить в комнату' }));

        expect((await screen.findByRole('alert')).textContent).toContain('Не удалось вступить');
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();
    });

    it('показывает read-only peek только при world_readable и останавливает его', async () => {
        const event = {
            getId: () => '$message',
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Доступная история' }),
            getSender: () => '@alice:example.org',
            getRelation: () => null,
            isRedacted: () => false,
        } as unknown as MatrixEvent;
        const previewRoom = {
            getLiveTimeline: () => ({ getEvents: () => [event] }),
        } as unknown as Room;
        peekInRoom.mockResolvedValue(previewRoom);
        mocks.getRoomAccess.mockResolvedValue(access('public', { worldReadable: true }));

        const view = render(<RoomAccessGate roomId="!room:example.org" />);

        expect(await screen.findByText('Доступная история')).toBeTruthy();
        expect(peekInRoom).toHaveBeenCalledWith('!room:example.org', 20);
        expect(screen.queryByRole('textbox', { name: 'Сообщение' })).toBeNull();

        view.unmount();
        expect(stopPeeking).toHaveBeenCalled();
    });

    it('не перезапускает peek при ClientEvent.Room от peekInRoom', async () => {
        const event = {
            getId: () => '$message',
            getType: () => 'm.room.message',
            getContent: () => ({ body: 'Стабильный preview' }),
            getSender: () => '@alice:example.org',
            getRelation: () => null,
            isRedacted: () => false,
        } as unknown as MatrixEvent;
        const previewRoom = {
            getLiveTimeline: () => ({ getEvents: () => [event] }),
        } as unknown as Room;
        peekInRoom
            .mockImplementationOnce(async () => {
                emit(ClientEvent.Room);
                return previewRoom;
            })
            // Ограничиваем известный feedback loop, чтобы RED завершался assertion'ом.
            .mockImplementation(() => new Promise<Room>(() => undefined));
        mocks.getRoomAccess.mockResolvedValue(access('public', { worldReadable: true }));

        render(<RoomAccessGate roomId="!room:example.org" />);

        expect(await screen.findByText('Стабильный preview')).toBeTruthy();
        expect(peekInRoom).toHaveBeenCalledTimes(1);
    });

    it('не вызывает peek без явного разрешения', async () => {
        mocks.getRoomAccess.mockResolvedValue(access('public', { worldReadable: false }));

        render(<RoomAccessGate roomId="!room:example.org" />);

        await screen.findByRole('button', { name: 'Вступить в комнату' });
        expect(peekInRoom).not.toHaveBeenCalled();
    });

    it('игнорирует устаревший ответ после смены roomId', async () => {
        const first = deferred<RoomAccess>();
        mocks.getRoomAccess
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce({ kind: 'inaccessible', summary: null });
        const view = render(<RoomAccessGate roomId="!first:example.org" />);

        view.rerender(<RoomAccessGate roomId="!second:example.org" />);
        expect(await screen.findByText('Нет доступа к этой комнате')).toBeTruthy();

        await act(async () => first.resolve(access('public')));

        expect(screen.queryByRole('button', { name: 'Вступить в комнату' })).toBeNull();
        expect(screen.queryByText('Публичная комната')).toBeNull();
        expect(RoomEvent.MyMembership).toBeTruthy();
    });
});
