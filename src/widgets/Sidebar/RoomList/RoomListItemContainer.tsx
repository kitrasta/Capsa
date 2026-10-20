import { memo } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useRoomListItem } from './hooks/useRoomListItem';
import { useRoomListItemAvatar } from './hooks/useRoomListItemAvatar';
import RoomListItem from './RoomListItem';

interface Props {
    room: Room;
    active?: boolean;
    onClick: (roomId: string) => void;
}

const AVATAR_SIZE = 40;

// Контейнер над чистовым RoomListItem: вызывает хуки (их нельзя звать
// в цикле map в RoomList) и передаёт компоненту только снимок данных.
// memo по {room, active, onClick}: identity комнаты стабилен, а обновления
// приходят через подписку useRoomListItem — родительский рендер не нужен.
const RoomListItemContainer = memo(({ room, active = false, onClick }: Props) => {
    // view — только данные; onClick/isActive идут явными пропсами,
    // чтобы у каждого значения был один источник
    const view = useRoomListItem(room);
    const avatarSrc = useRoomListItemAvatar(view.avatarUrl, AVATAR_SIZE);

    return (
        <RoomListItem
            {...view}
            avatarSrc={avatarSrc}
            isActive={active}
            onClick={onClick}
        />
    );
});

RoomListItemContainer.displayName = 'RoomListItemContainer';

export default RoomListItemContainer;
