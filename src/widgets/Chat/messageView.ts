// Снимок видимых данных сообщения для пузыря.
// MatrixEvent мутирует (расшифровка, статус отправки) при неизменном
// identity — поэтому родитель снимает с него данные на момент рендера,
// а чистовой MessageBubble сравнивает их через React.memo.
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { EventStatus } from 'matrix-js-sdk';

export interface MessageView {
    id: string;
    body: string;
    formattedBody: string | null;
    senderName: string;
    ts: number;
    sendStatus: string | null;
    isOwn: boolean;
}

// честный статус отправки своего сообщения
const getSendStatus = (event: MatrixEvent): string | null => {
    const status = event.status;

    if (status === EventStatus.SENDING || status === EventStatus.QUEUED || status === EventStatus.ENCRYPTING) {
        return '🕓'; // еще не ушли на сервер
    }
    if (status === EventStatus.SENT) {
        return '✓'; // сервер принял, эхо еще не пришло
    }
    if (status === EventStatus.NOT_SENT || status === EventStatus.CANCELLED) {
        return '⚠'; // ошибка отправки
    }
    return null; // подтверждено сервером (обычное событие из sync)
};

// сообщение могло быть отправлено с форматированием (org.matrix.custom.html)
const getFormattedBody = (event: MatrixEvent): string | null => {
    if (event.getContent<{ format?: string }>().format !== 'org.matrix.custom.html') {
        return null;
    }
    return event.getContent<{ formatted_body?: string }>().formatted_body ?? null;
};

export const toMessageView = (
    event: MatrixEvent,
    room: Room,
    isOwn: boolean,
): MessageView => {
    const senderId = event.getSender() ?? '';
    return {
        id: event.getId() ?? '',
        body: event.getContent<{ body?: string }>().body ?? '',
        formattedBody: getFormattedBody(event),
        senderName: room.currentState.getMember(senderId)?.name ?? senderId,
        ts: event.getTs(),
        sendStatus: isOwn ? getSendStatus(event) : null,
        isOwn,
    };
};
