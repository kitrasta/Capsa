import { describe, expect, it } from 'vitest';
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import {
    getDirectSpaceChildIds,
    getJoinedSpaceRoots,
} from '../api/space-folders';

const childEvent = (childId: string, via: unknown = ['example.org']): MatrixEvent => ({
    getStateKey: () => childId,
    getContent: () => ({ via }),
}) as unknown as MatrixEvent;

const spaceRoom = (roomId: string, name: string, children: MatrixEvent[] = []): Room => ({
    roomId,
    name,
    isSpaceRoom: () => true,
    getMyMembership: () => 'join',
    currentState: {
        getStateEvents: () => children,
    },
}) as unknown as Room;

describe('space folder graph', () => {
    it('читает только живые direct m.space.child edges и убирает дубликаты', () => {
        const space = spaceRoom('!root:example.org', 'Root', [
            childEvent('!a:example.org'),
            childEvent('!removed:example.org', []),
            childEvent('!invalid:example.org', 'example.org'),
            childEvent('!a:example.org'),
        ]);

        expect(getDirectSpaceChildIds(space)).toEqual(['!a:example.org']);
    });

    it('оставляет корнем Space без joined parent и не показывает его joined child сверху', () => {
        const child = spaceRoom('!child:example.org', 'Child');
        const root = spaceRoom('!root:example.org', 'Root', [
            childEvent(child.roomId),
        ]);
        const unrelated = spaceRoom('!other:example.org', 'Other');
        const client = {
            getRooms: () => [child, root, unrelated],
        } as unknown as MatrixClient;

        expect(getJoinedSpaceRoots(client).map((room) => room.roomId)).toEqual([
            '!other:example.org',
            '!root:example.org',
        ]);
    });

    it('выбирает одну доступную точку входа в чистый цикл без естественного корня', () => {
        const a = spaceRoom('!a:example.org', 'A');
        const b = spaceRoom('!b:example.org', 'B');
        a.currentState.getStateEvents = () => [childEvent(b.roomId)];
        b.currentState.getStateEvents = () => [childEvent(a.roomId)];
        const client = { getRooms: () => [a, b] } as unknown as MatrixClient;

        expect(getJoinedSpaceRoots(client).map((room) => room.roomId)).toEqual([
            '!a:example.org',
        ]);
    });

    it('не добавляет циклический потомок в корни, если он достижим из обычного корня', () => {
        const a = spaceRoom('!a:example.org', 'A');
        const b = spaceRoom('!b:example.org', 'B');
        const root = spaceRoom('!root:example.org', 'Root', [childEvent(a.roomId)]);
        a.currentState.getStateEvents = () => [childEvent(b.roomId)];
        b.currentState.getStateEvents = () => [childEvent(a.roomId)];
        const client = { getRooms: () => [a, root, b] } as unknown as MatrixClient;

        expect(getJoinedSpaceRoots(client).map((room) => room.roomId)).toEqual([
            '!root:example.org',
        ]);
    });
});
