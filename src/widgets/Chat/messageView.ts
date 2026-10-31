// Снимок видимых данных сообщения для пузыря.
//
// MatrixEvent мутирует (расшифровка, статус отправки) при неизменном
// identity — поэтому родитель снимает с него данные на момент рендера,
// а чистовой MessageBubble сравнивает их через React.memo.
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { EventStatus, RelationType } from 'matrix-js-sdk';
import {
    trimReplyFromBody,
    trimReplyFromFormattedBody,
    getEventReactions,
} from '../../shared/lib/matrix';

// ----------------------------------------------------------------------------
// Снимок реакции
// ----------------------------------------------------------------------------

export interface ReactionView {
    key: string;
    count: number;
    mine: boolean;
}

// ----------------------------------------------------------------------------
// Снимок того, на что отвечают (если есть)
// ----------------------------------------------------------------------------

export interface ReplyView {
    senderName: string;
    body: string;
}

// ----------------------------------------------------------------------------
// Снимок сообщения: все поля, которые нужны пузырю. Снимаем здесь, а не в
// пузыре — чтобы реакция/цитата/статус правки всегда были консистентны
// (а не отставали от ленты при пагинации).
// ----------------------------------------------------------------------------

export interface MessageView {
    id: string;
    body: string;
    formattedBody: string | null;
    senderName: string;
    ts: number;
    sendStatus: string | null;
    isOwn: boolean;
    isEdited: boolean;
    replyTo: ReplyView | null;
    reactions: ReactionView[];
    canEdit: boolean;
}

const getSendStatus = (event: MatrixEvent): string | null => {
    const status = event.status;

    if (status === EventStatus.SENDING || status === EventStatus.QUEUED || status === EventStatus.ENCRYPTING) {
        return '🕓';
    }
    if (status === EventStatus.SENT) {
        return '✓';
    }
    if (status === EventStatus.NOT_SENT || status === EventStatus.CANCELLED) {
        return '⚠';
    }
    return null;
};

const getFormattedBody = (event: MatrixEvent): string | null => {
    if (event.getContent<{ format?: string }>().format !== 'org.matrix.custom.html') {
        return null;
    }
    return trimReplyFromFormattedBody(event.getContent<{ formatted_body?: string }>().formatted_body ?? '');
};

/** Снимок «на что отвечаю» — смотрим в wire-контент (не меняется при правке). */
const getReplyView = (event: MatrixEvent, room: Room): ReplyView | null => {
    const replyId = event.replyEventId;
    if (!replyId) return null;

    const target = room.findEventById(replyId);
    if (!target) {
        return { senderName: '', body: 'Сообщение недоступно' };
    }
    if (target.isRedacted()) {
        return { senderName: '', body: 'Сообщение удалено' };
    }

    return {
        senderName: room.currentState.getMember(target.getSender() ?? '')?.name ?? target.getSender() ?? '',
        body: trimReplyFromBody(target.getContent<{ body?: string }>().body ?? ''),
    };
};

export const toMessageView = (
    event: MatrixEvent,
    room: Room,
    myUserId: string | null,
): MessageView => {
    const senderId = event.getSender() ?? '';
    const isOwn = senderId === myUserId;
    const content = event.getContent<{ body?: string }>();

    return {
        id: event.getId() ?? '',
        body: trimReplyFromBody(content.body ?? ''),
        formattedBody: getFormattedBody(event),
        senderName: room.currentState.getMember(senderId)?.name ?? senderId,
        ts: event.getTs(),
        sendStatus: isOwn ? getSendStatus(event) : null,
        isOwn,
        // SDK сам пересобирает getContent() из m.new_content при получении
        // правки (m.replace) — заменяющее событие уже при агрегации.
        isEdited: event.replacingEventId() !== undefined,
        replyTo: getReplyView(event, room),
        reactions: getEventReactions(room, event.getId() ?? '').map(([key, events]) => ({
            key,
            count: events.size,
            mine: myUserId !== null && [...events].some((e) => e.getSender() === myUserId),
        })),
        canEdit:
            !event.isRedacted() &&
            isOwn &&
            content.msgtype === 'm.text' &&
            !event.getRelation(),
    };
};

// ----------------------------------------------------------------------------
// Сравнение двух снимков пузырей. Поля-примитивы — по значению (новые объекты
// с теми же значениями считаются равными), реакции и цитата —
// структурно. Callback'ы — по идентичности. Это позволяет React.memo
// пропускать перерисовку, когда лента пересчиталась, а визуально сообщение
// не изменилось.
// ----------------------------------------------------------------------------

const sameReaction = (a: ReactionView, b: ReactionView): boolean =>
    a.key === b.key && a.count === b.count && a.mine === b.mine;

const sameReactions = (a: ReactionView[], b: ReactionView[]): boolean =>
    a.length === b.length && a.every((r, i) => sameReaction(r, b[i]));

const sameReply = (a: ReplyView | null, b: ReplyView | null): boolean =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.senderName === b.senderName &&
        a.body === b.body);

export const sameMessageView = (
    prev: MessageView,
    next: MessageView,
): boolean =>
    prev === next ||
    (prev.id === next.id &&
        prev.body === next.body &&
        prev.formattedBody === next.formattedBody &&
        prev.senderName === next.senderName &&
        prev.ts === next.ts &&
        prev.sendStatus === next.sendStatus &&
        prev.isOwn === next.isOwn &&
        prev.isEdited === next.isEdited &&
        sameReply(prev.replyTo, next.replyTo) &&
        sameReactions(prev.reactions, next.reactions) &&
        prev.canEdit === next.canEdit);
