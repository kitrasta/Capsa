// Лента сообщений комнаты: события live-timeline → отображаемый массив.
//
// Пересобираем массив только когда он реально меняется:
//  - новые события / локальные эхо (RoomEvent.Timeline, LocalEchoUpdated);
//  - расшифровка события ЭТОЙ комнаты, которое после неё становится
//    видимым сообщением (MatrixEventEvent.Decrypted);
//  - редирекции (комнаты перемещаются по спискам, реакции/правки
//    доходят через SDK-агрегацию, но иногда нужно пробуждение и явно).
import { useEffect, useMemo, useState } from 'react';
import { MatrixEventEvent, RoomEvent } from 'matrix-js-sdk';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';

// Событие попадает в ленту: не отредактировано, это сообщение с текстом.
// События-отношения (m.replace — правка, m.annotation — реакция) уже
// вшиты в основное сообщение и в его снимок — в ленту их не показываем.
export const isVisibleMessage = (event: MatrixEvent): boolean => {
    if (typeof event.getRelation === 'function') {
        const rel = event.getRelation();
        if (rel?.rel_type === 'm.replace' || rel?.rel_type === 'm.annotation') {
            return false;
        }
    }

    return !event.isRedacted() && event.getType() === 'm.room.message' && Boolean(event.getContent<{ body?: string }>().body);
};

export const useRoomTimeline = (room: Room | null | undefined): MatrixEvent[] => {
    const [version, setVersion] = useState(0);
    // id расшифрованных событий этой комнаты. Каждое новое — повод
    // пересчитать ленту; повторные Decrypted по тому же событию игнорируем.
    // (Set комнат здесь бы не сработал: size перестаёт меняться после
    // первого события, и второе расшифрованное сообщение не появилось бы.)
    const [decryptedIds, setDecryptedIds] = useState<ReadonlySet<string>>(new Set());

    // новые сообщения / локальные эхо — перерисовываем ленту
    useEffect(() => {
        if (!room) return;

        const onTimeline = () => setVersion((v) => v + 1);

        room.on(RoomEvent.Timeline, onTimeline);
        room.on(RoomEvent.LocalEchoUpdated, onTimeline);
        // правки/реакции доходят через SDK-агрегацию (Timeline/LiveEchoUpdated);
        // но для внешних действий (редирект комнаты, редирекции реакций)
        // срабатывает и RoomEvent.Redaction — он тоже пробуждает пересчёт.
        room.on(RoomEvent.Redaction, onTimeline);
        return () => {
            room.off(RoomEvent.Timeline, onTimeline);
            room.off(RoomEvent.LocalEchoUpdated, onTimeline);
            room.off(RoomEvent.Redaction, onTimeline);
        };
    }, [room]);

    // зашифрованные события расшифровываются асинхронно:
    // событие приходит как m.room.encrypted, а после расшифровки
    // меняет тип на m.room.message и эмитит Decrypted.
    // SDK отдаёт (event: MatrixEvent, err?) — у события есть getRoomId()
    useEffect(() => {
        if (!room) return;

        const client = getClient();
        const onDecrypted = (event: MatrixEvent, err?: Error) => {
            // не расшифровалось — список не менялся, пересчитывать нечего
            if (err) return;
            if (event.getRoomId() !== room.roomId) return;
            // пересчитываем, только если событие реально появится в ленте
            // (реакции, state-события и прочее мимо)
            if (!isVisibleMessage(event)) return;

            const id = event.getId();
            if (!id) return;
            setDecryptedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        };

        client.on(MatrixEventEvent.Decrypted, onDecrypted);
        return () => {
            client.off(MatrixEventEvent.Decrypted, onDecrypted);
        };
    }, [room]);

    return useMemo(() => {
        if (!room) return [];
        void version; // перечитываем при смене версии
        void decryptedIds.size; // ...и при расшифровке событий
        return room.getLiveTimeline().getEvents().filter(isVisibleMessage);
    }, [room, version, decryptedIds.size]);
};
