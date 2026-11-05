import { EventType } from 'matrix-js-sdk';
import type { MatrixClient, Room } from 'matrix-js-sdk';

/** Живые direct-ссылки Space; пустой content/via означает удаление связи. */
export const getDirectSpaceChildIds = (space: Room): string[] => {
    const events = space.currentState.getStateEvents(EventType.SpaceChild);
    if (!Array.isArray(events)) return [];

    const result = new Set<string>();
    for (const event of events) {
        const childId = event.getStateKey();
        const via = event.getContent<{ via?: unknown }>().via;
        if (
            childId &&
            Array.isArray(via) &&
            via.length > 0 &&
            via.every((server) => typeof server === 'string' && server.length > 0)
        ) {
            result.add(childId);
        }
    }
    return [...result];
};

/**
 * Корни — joined Spaces без joined parent. После обхода добавляем каждый
 * ещё недостижимый компонент, чтобы чистый цикл не исчезал из фильтров.
 */
export const getJoinedSpaceRoots = (client: MatrixClient): Room[] => {
    const spaces = client.getRooms().filter(
        (room) => room.isSpaceRoom() && room.getMyMembership() === 'join',
    );
    const byId = new Map(spaces.map((space) => [space.roomId, space]));
    const children = new Map(
        spaces.map((space) => [
            space.roomId,
            getDirectSpaceChildIds(space).filter((childId) => byId.has(childId)),
        ]),
    );
    const hasJoinedParent = new Set([...children.values()].flat());
    const roots: Room[] = [];
    const visited = new Set<string>();

    const visitFrom = (root: Room): void => {
        roots.push(root);
        const queue = [root.roomId];
        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            for (const childId of children.get(currentId) ?? []) {
                if (!visited.has(childId)) queue.push(childId);
            }
        }
    };

    spaces.filter((space) => !hasJoinedParent.has(space.roomId)).forEach(visitFrom);
    spaces.forEach((space) => {
        if (!visited.has(space.roomId)) visitFrom(space);
    });

    return roots.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
};
