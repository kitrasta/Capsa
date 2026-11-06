import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from 'matrix-js-sdk';

const mocks = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('../client', () => ({ getClient: mocks.getClient }));

import {
    canPeekRoom,
    getRoomAccess,
    knockRoom,
} from '../api/room-access';

const localRoom = (
    membership: string,
    joinRule = 'invite',
    historyVisibility = 'shared',
): Room => ({
    roomId: '!room:example.org',
    name: 'Локальная',
    getMyMembership: () => membership,
    getJoinRule: () => joinRule,
    getHistoryVisibility: () => historyVisibility,
    getMxcAvatarUrl: () => null,
    isSpaceRoom: () => false,
    getJoinedMemberCount: () => 4,
}) as unknown as Room;

const remoteSummary = (extra: Record<string, unknown> = {}) => ({
    room_id: '!room:example.org',
    name: 'Удалённая',
    avatar_url: null,
    room_type: null,
    join_rule: 'public',
    world_readable: false,
    guest_can_join: false,
    num_joined_members: 8,
    ...extra,
});

const setup = (room: Room | null, summaryResult?: unknown) => {
    const getRoomSummary = vi.fn(async () => summaryResult);
    if (summaryResult instanceof Error) getRoomSummary.mockRejectedValue(summaryResult);
    const knock = vi.fn(async () => ({ room_id: '!room:example.org' }));
    mocks.getClient.mockReturnValue({
        getRoom: () => room,
        getRoomSummary,
        getDomain: () => 'example.org',
        knockRoom: knock,
    } as unknown as MatrixClient);
    return { getRoomSummary, knock };
};

describe('room access', () => {
    beforeEach(() => vi.clearAllMocks());

    it.each([
        ['join', 'joined'],
        ['invite', 'invited'],
        ['knock', 'knock-pending'],
        ['leave', 'public'],
    ])('использует локальное membership %s без summary request', async (membership, expected) => {
        const { getRoomSummary } = setup(localRoom(membership, 'public'));

        await expect(getRoomAccess('!room:example.org')).resolves.toMatchObject({
            kind: expected,
            summary: { name: 'Локальная', joinRule: 'public' },
        });
        expect(getRoomSummary).not.toHaveBeenCalled();
    });

    it('классифицирует remote public и передаёт текущий сервер в via', async () => {
        const { getRoomSummary } = setup(null, remoteSummary({ world_readable: true }));

        const result = await getRoomAccess('!room:example.org');

        expect(result).toEqual({
            kind: 'public',
            summary: {
                name: 'Удалённая',
                avatarUrl: null,
                roomType: null,
                joinRule: 'public',
                worldReadable: true,
                guestCanJoin: false,
                memberCount: 8,
            },
        });
        expect(getRoomSummary).toHaveBeenCalledWith('!room:example.org', ['example.org']);
    });

    it.each([
        ['knock', 'knock'],
        ['invite', 'invite-only'],
        [undefined, 'invite-only'],
    ])('классифицирует remote join_rule %s как %s', async (joinRule, expected) => {
        setup(null, remoteSummary({ join_rule: joinRule }));

        await expect(getRoomAccess('!room:example.org')).resolves.toMatchObject({
            kind: expected,
        });
    });

    it.each(['M_FORBIDDEN', 'M_NOT_FOUND', 'M_UNRECOGNIZED'])(
        'не раскрывает недоступную комнату при %s',
        async (errcode) => {
            const error = Object.assign(new Error('denied'), { errcode });
            setup(null, error);

            await expect(getRoomAccess('!room:example.org')).resolves.toEqual({
                kind: 'inaccessible',
                summary: null,
            });
        },
    );

    it('отправляет настоящий knock request', async () => {
        const { knock } = setup(null);

        await knockRoom('!room:example.org');

        expect(knock).toHaveBeenCalledWith('!room:example.org');
    });

    it('разрешает peek только при явном world_readable', () => {
        const base = {
            name: null,
            avatarUrl: null,
            roomType: null,
            joinRule: 'public',
            worldReadable: false,
            guestCanJoin: false,
            memberCount: 0,
        };
        expect(canPeekRoom(null)).toBe(false);
        expect(canPeekRoom(base)).toBe(false);
        expect(canPeekRoom({ ...base, worldReadable: true })).toBe(true);
    });
});
