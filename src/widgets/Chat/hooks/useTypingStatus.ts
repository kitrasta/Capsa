// Статус печати в комнате: кто печатает (кроме меня) → строка для шапки.
// SDK разбирает m.typing ephemeral-события и помечает участников,
// клиент ре-эмитит RoomMemberEvent.Typing.
import { useEffect, useState } from 'react';
import { RoomMemberEvent } from 'matrix-js-sdk';
import type { MatrixEvent, Room, RoomMember } from 'matrix-js-sdk';
import { getClient } from '../../../shared/lib/matrix';

export const useTypingStatus = (room: Room | null | undefined): string | null => {
    const [names, setNames] = useState<string[]>([]);

    useEffect(() => {
        if (!room) return;

        const client = getClient();
        const myUserId = client.getUserId();

        const read = () => {
            const newNames = room
                .getMembers()
                .filter((member) => member.typing && member.userId !== myUserId)
                .map((member) => member.name);
            // список не изменился — не перерисовываем
            setNames((prev) =>
                newNames.length === prev.length &&
                newNames.every((name, i) => name === prev[i])
                    ? prev
                    : newNames,
            );
        };

        // обработчик именованный и ОДИН: off со свежей стрелочной функцией
        // ничего не снимает — подписка утекла бы при каждом ре-ране эффекта
        const onTyping = (_event: MatrixEvent, member: RoomMember) => {
            if (member.roomId === room.roomId) read();
        };

        read();
        client.on(RoomMemberEvent.Typing, onTyping);
        return () => {
            client.off(RoomMemberEvent.Typing, onTyping);
        };
    }, [room]);

    return names.length === 1
        ? `${names[0]} печатает…`
        : names.length === 2
          ? `${names[0]} и ${names[1]} печатают…`
          : names.length > 2
            ? 'несколько человек печатают…'
            : null;
};
