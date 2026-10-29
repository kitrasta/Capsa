import { describe, expect, it, vi, beforeEach } from 'vitest';

// без SDK: toChildSummaries — чистая функция, а matrix-js-sdk и клиент
// замоканы, чтобы тесты не тянули runtime матричной библиотеки
vi.mock('matrix-js-sdk', () => ({
    EventType: { SpaceChild: 'm.space.child' },
    RoomType: { Space: 'm.space' },
}));
vi.mock('../client', () => ({
    MATRIX_SERVER_NAME: 'example.org',
    getClient: vi.fn(),
}));

import { toChildSummaries, getSpaceChildSummaries } from '../api/spaces';
import { getClient } from '../client';
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';

const SPACE_ID = '!space:example.org';

// helper: подставляет только нужные поля, остальные обязательные поля
// IPublicChunksRoom тесту не важны — кастуем к IHierarchyRoom.
// name/avatar_url по умолчанию НЕ кладём — как в реальном ответе, где их нет
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

    it('собирает имя и аватар детей', () => {
        const result = toChildSummaries(SPACE_ID, [
            hierarchyRoom('!a:example.org', { name: 'Alpha', avatar_url: 'mxc://a/1' }),
            hierarchyRoom('!b:example.org', { name: 'Beta', avatar_url: 'mxc://b/2' }),
        ]);

        expect(result.get('!a:example.org')).toEqual({ name: 'Alpha', avatarUrl: 'mxc://a/1' });
        expect(result.get('!b:example.org')).toEqual({ name: 'Beta', avatarUrl: 'mxc://b/2' });
    });

    it('отсутствующие поля → null, а не undefined', () => {
        const result = toChildSummaries(SPACE_ID, [hierarchyRoom('!a:example.org')]);

        // toStrictEqual, а не toEqual: toEqual игнорирует undefined-свойства
        // и не поймал бы подмену null на undefined
        expect(result.get('!a:example.org')).toStrictEqual({ name: null, avatarUrl: null });
        expect(result.get('!a:example.org')?.name).toBeNull();
        expect(result.get('!a:example.org')?.avatarUrl).toBeNull();
    });

    it('пустой список комнат → пустая карта', () => {
        expect(toChildSummaries(SPACE_ID, [])).toEqual(new Map());
    });
});

describe('getSpaceChildSummaries', () => {
    beforeEach(() => {
        vi.mocked(getClient).mockReset();
    });

    it('делает ОДИН запрос на пространство и отдаёт разобранные summary', async () => {
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

        // limit = 50, maxDepth = 1 — вложенные пространства не нужны
        expect(getRoomHierarchy).toHaveBeenCalledTimes(1);
        expect(getRoomHierarchy).toHaveBeenCalledWith(SPACE_ID, 50, 1);
        expect(result).toEqual(
            new Map([
                ['!a:example.org', { name: 'Alpha', avatarUrl: 'mxc://a/1' }],
                ['!b:example.org', { name: null, avatarUrl: null }],
            ]),
        );
    });
});
