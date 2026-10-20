// Появление комнаты в сторе клиента: после F5 комнаты может не быть,
// пока не завершится sync — отслеживаем её появление реактивно.
import { useSyncExternalStore } from 'react';
import { ClientEvent } from 'matrix-js-sdk';
import type { Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';

// подписка на события стора; один и тот же onChange в on/off —
// иначе off ничего не снимает и подписка утекает
const subscribeStore = (onChange: () => void): (() => void) => {
    const client = getClient();
    client.on(ClientEvent.Sync, onChange);
    client.on(ClientEvent.Room, onChange);
    return () => {
        client.off(ClientEvent.Sync, onChange);
        client.off(ClientEvent.Room, onChange);
    };
};

export const useRoomReady = (roomId: string): Room | null =>
    useSyncExternalStore(
        subscribeStore,
        () => getClient().getRoom(roomId),
        () => null,
    );

// идёт ли начальный sync (состояние SDK): пока да — комната ещё может
// появиться; если уже нет, а комнаты нет — она юзеру недоступна
export const useIsLoading = (): boolean =>
    useSyncExternalStore(
        subscribeStore,
        () => !getClient().isInitialSyncComplete(),
        () => true,
    );
