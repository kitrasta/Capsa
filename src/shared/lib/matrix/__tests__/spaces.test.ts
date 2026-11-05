import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('matrix-js-sdk', () => ({
    EventType: { SpaceChild: 'm.space.child' },
    RoomType: { Space: 'm.space' },
}));
vi.mock('../client', () => ({
    MATRIX_SERVER_NAME: 'example.org',
    getClient: vi.fn(),
}));

import { addRoomToSpace, toChildSummaries, getSpaceChildSummaries } from '../api/spaces';
import { getClient } from '../client';
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';

const SPACE_ID = '!space:example.org';
const EMPTY_SUMMARY = {
    name: null,
    avatarUrl: null,
    roomType: null,
    joinRule: null,
    worldReadable: false,
    guestCanJoin: false,
    memberCount: 0,
};

const hierarchyRoom = (roomId: string, extra: Record<string, unknown> = {}): IHierarchyRoom =>
    ({
        room_id: roomId,
        children_state: [],
        ...extra,
    }) as unknown as IHierarchyRoom;

describe('toChildSummaries', () => {
    it('отбрасывает само пространство (первым элементом в ответе)', () => {
        const result = toChildSummaries(SPACE_ID, [
            hierarchyRoom(SPACE_ID, { name: 'Space' }),
            hierarchyRoom('!child:example.org', { name: 'Child' }),
        ]);

        expect(result.has(SPACE_ID)).toBe(false);
        expect(result.size).toBe(1);
    });

    it('собирает имя, аватар и доступ детей', () => {
        const result = toChildSummaries(SPACE_ID, [
            hierarchyRoom('!a:example.org', { name: 'Alpha', avatar_url: 'mxc://a/1' }),
            hierarchyRoom('!b:example.org', { name: 'Beta', avatar_url: 'mxc://b/2' }),
        ]);

        expect(result.get('!a:example.org')).toEqual({
            ...EMPTY_SUMMARY,
            name: 'Alpha',
            avatarUrl: 'mxc://a/1',
        });
        expect(result.get('!b:example.org')).toEqual({
            ...EMPTY_SUMMARY,
            name: 'Beta',
            avatarUrl: 'mxc://b/2',
        });
    });

    it('отсутствующие поля получают безопасные значения по умолчанию', () => {
        const result = toChildSummaries(SPACE_ID, [hierarchyRoom('!a:example.org')]);

        expect(result.get('!a:example.org')).toStrictEqual(EMPTY_SUMMARY);
    });

    it('пустой список комнат → пустая карта', () => {
        expect(toChildSummaries(SPACE_ID, [])).toEqual(new Map());
    });
});

describe('addRoomToSpace', () => {
    it('без server name не отправляет событие с пустым via', async () => {
        const sendStateEvent = vi.fn(async () => '$event');
        vi.mocked(getClient).mockReturnValue({
            getDomain: () => null,
            sendStateEvent,
        } as unknown as ReturnType<typeof getClient>);

        await expect(addRoomToSpace(SPACE_ID, '!child:example.org')).rejects.toThrow(
            'Не удалось определить сервер текущего аккаунта',
        );
        expect(sendStateEvent).not.toHaveBeenCalled();
    });

    it('использует server name текущего клиента для via', async () => {
        const sendStateEvent = vi.fn(async () => '$event');
        vi.mocked(getClient).mockReturnValue({
            getDomain: () => 'elsewhere.org',
            sendStateEvent,
        } as unknown as ReturnType<typeof getClient>);

        await addRoomToSpace(SPACE_ID, '!child:example.org');

        expect(sendStateEvent).toHaveBeenCalledWith(
            SPACE_ID,
            'm.space.child',
            { via: ['elsewhere.org'] },
            '!child:example.org',
        );
    });
});

describe('getSpaceChildSummaries', () => {
    beforeEach(() => {
        vi.mocked(getClient).mockReset();
    });

    it('отдаёт разобранные summary для одной страницы', async () => {
        const getRoomHierarchy = vi.fn(async () => ({
            rooms: [
                hierarchyRoom(SPACE_ID, { name: 'Space' }),
                hierarchyRoom('!a:example.org', { name: 'Alpha', avatar_url: 'mxc://a/1' }),
                hierarchyRoom('!b:example.org'),
            ],
        }));
        vi.mocked(getClient).mockReturnValue({ getRoomHierarchy } as unknown as ReturnType<
            typeof getClient
        >);

        const result = await getSpaceChildSummaries(SPACE_ID);

        expect(getRoomHierarchy).toHaveBeenCalledTimes(1);
        expect(getRoomHierarchy).toHaveBeenCalledWith(SPACE_ID, 50, 1, false, undefined);
        expect(result).toEqual(
            new Map([
                ['!a:example.org', {
                    ...EMPTY_SUMMARY,
                    name: 'Alpha',
                    avatarUrl: 'mxc://a/1',
                }],
                ['!b:example.org', EMPTY_SUMMARY],
            ]),
        );
    });

    it('загружает следующие страницы, убирает дубликаты и сохраняет поля доступа', async () => {
        const getRoomHierarchy = vi.fn()
            .mockResolvedValueOnce({
                rooms: [
                    hierarchyRoom('!a:example.org', { name: 'Old' }),
                    hierarchyRoom('!space-child:example.org', {
                        name: 'Nested',
                        room_type: 'm.space',
                    }),
                ],
                next_batch: 'next-page',
            })
            .mockResolvedValueOnce({
                rooms: [
                    hierarchyRoom('!a:example.org', {
                        name: 'Public',
                        join_rule: 'public',
                        world_readable: true,
                        guest_can_join: true,
                        num_joined_members: 7,
                    }),
                ],
            });
        vi.mocked(getClient).mockReturnValue({ getRoomHierarchy } as unknown as ReturnType<
            typeof getClient
        >);

        const result = await getSpaceChildSummaries(SPACE_ID);

        expect(getRoomHierarchy).toHaveBeenNthCalledWith(2, SPACE_ID, 50, 1, false, 'next-page');
        expect(result.size).toBe(2);
        expect(result.get('!a:example.org')).toEqual({
            ...EMPTY_SUMMARY,
            name: 'Public',
            joinRule: 'public',
            worldReadable: true,
            guestCanJoin: true,
            memberCount: 7,
        });
        expect(result.get('!space-child:example.org')).toEqual({
            ...EMPTY_SUMMARY,
            name: 'Nested',
            roomType: 'm.space',
        });
    });
});
