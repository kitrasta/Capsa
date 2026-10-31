// Ответы, редактирование и реакции: построение content'ов и отправка.
//
// Матричная семантика — строго по spec:
//  - ответ:   m.relates_to => m.in_reply_to => { event_id } + цитата в body
//  - правка:  m.new_content (новое тело) + body как «* текст» + m.relates_to => m.replace
//  - реакция: m.reaction event с m.relates_to => m.annotation => { event_id, key }
//
// Тестируемая часть — только функции-фабрики; отправку через getClient,
// поэтому хуки выглядят как тонкая обёртка.

import { EventType, RelationType, MsgType } from 'matrix-js-sdk';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import type { ReactionEventContent } from 'matrix-js-sdk/lib/@types/events';
import { getClient } from '../client';

/** Цитата, которую нечитаемые без поддержки ответов клиенты показывают как «> <@user> ...». */
export const parseReplyBody = (sender: string, body: string): string =>
    `> <${sender}> ${body.replace(/\n/g, '\n> ')}\n\n`;

/** Удаляет цитату-заглушку из тела, построенного parseReplyBody. */
export const trimReplyFromBody = (body: string): string => {
    const match = body.match(/^> <.+?> .+\n(>.*\n)*?\n/m);
    return match ? body.slice(match[0].length) : body;
};

/** Удаляет блок <mx-reply>…</mx-reply> из отформатированного тела. */
export const trimReplyFromFormattedBody = (formattedBody: string): string => {
    const suffix = '</mx-reply>';
    const i = formattedBody.lastIndexOf(suffix);
    return i < 0 ? formattedBody : formattedBody.slice(i + suffix.length);
};

/** Полное содержимое, которое нужно отправить как новый ответ. */
export interface ReplyTarget {
    id: string;
    sender: string;
    body: string;
}

interface ReplyRelation {
    'm.in_reply_to': { event_id: string };
}

type TextMessageType = MsgType.Text | MsgType.Emote | MsgType.Notice;

interface ReplyMessageContent {
    msgtype: MsgType.Text;
    body: string;
    'm.relates_to': { 'm.in_reply_to': { event_id: string } };
}

interface EditMessageContent {
    msgtype: TextMessageType;
    body: string;
    'm.new_content': {
        msgtype: TextMessageType;
        body: string;
        'm.relates_to'?: ReplyRelation;
    };
    'm.relates_to': { event_id: string; rel_type: RelationType.Replace };
}

/** Content ответа: цитата в body (fallback) + m.in_reply_to. */
export const buildReplyContent = (target: ReplyTarget, text: string): ReplyMessageContent => ({
    msgtype: MsgType.Text,
    body: parseReplyBody(target.sender, target.body) + text,
    'm.relates_to': { 'm.in_reply_to': { event_id: target.id } },
});

/** Content правки: m.new_content = новое тело, body = «* текст», m.relates_to => m.replace.
 *  Если сообщение было ответом, связь сохраняется в m.new_content. */
export const buildEditContent = (event: MatrixEvent, text: string): EditMessageContent => {
    const eventId = event.getId();
    if (!eventId) throw new Error('Cannot edit a message without an event id');

    const prev = event.getWireContent();
    const msgtype: TextMessageType =
        prev.msgtype === MsgType.Emote || prev.msgtype === MsgType.Notice
            ? prev.msgtype
            : MsgType.Text;
    const newContent: EditMessageContent['m.new_content'] = { msgtype, body: text };
    const inReplyTo = prev['m.relates_to']?.['m.in_reply_to'] as
        | { event_id: string }
        | undefined;
    if (inReplyTo) newContent['m.relates_to'] = { 'm.in_reply_to': inReplyTo };

    return {
        msgtype,
        body: `* ${text}`,
        'm.new_content': newContent,
        'm.relates_to': { event_id: eventId, rel_type: RelationType.Replace },
    };
};

export const getReactionContent = (eventId: string, key: string): ReactionEventContent => ({
    'm.relates_to': { event_id: eventId, key, rel_type: RelationType.Annotation },
});

export const getEventReactions = (room: Room, eventId: string): [string, Set<MatrixEvent>][] => {
    return (
        room
            .getUnfilteredTimelineSet()
            .relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction)
            ?.getSortedAnnotationsByKey() ?? []
    );
};

/** Отправить реакцию, если её нет, или отредактировать свою. */
export const toggleReaction = async (roomId: string, eventId: string, key: string) => {
    const client = getClient();
    const room = client.getRoom(roomId);
    if (!room) return;

    const [, events] = getEventReactions(room, eventId).find(([k]) => k === key) ?? [];
    const mine = events ? [...events].find((e) => e.getSender() === client.getUserId() && e.isRelation()) : undefined;

    if (mine?.getId()) {
        await client.redactEvent(roomId, mine.getId()!);
        return;
    }
    await client.sendEvent(roomId, EventType.Reaction, getReactionContent(eventId, key));
};

export const sendReplyMessage = (roomId: string, target: ReplyTarget, text: string) =>
    getClient().sendMessage(roomId, buildReplyContent(target, text));

export const editMessage = async (roomId: string, eventId: string, text: string) => {
    const client = getClient();
    const room = client.getRoom(roomId);
    const event = room?.findEventById(eventId);

    if (!event) {
        throw new Error(`Could not find message to edit: ${eventId}`);
    }

    await client.sendMessage(roomId, buildEditContent(event, text));
};
