// Ответы, редактирование и реакции: проверка построения content'ов.
//
// Ничего не идёт на сервер — матрису не мокать: проверяем структуру объектов,
// которые попадут в клиент, и поведение триммеров.

import { describe, expect, it } from 'vitest';
import {
    parseReplyBody,
    trimReplyFromBody,
    trimReplyFromFormattedBody,
    buildReplyContent,
    buildEditContent,
    getReactionContent,
} from '../api/messages';
import type { MatrixEvent } from 'matrix-js-sdk';

describe('parseReplyBody', () => {
    it('добавляет цитату-заглушку с переносом строк', () => {
        expect(parseReplyBody('@alice:example.org', 'Привет')).toBe(
            '> <@alice:example.org> Привет\n\n'
        );
    });

    it('переносит каждую строку ответа', () => {
        expect(parseReplyBody('@bob:example.org', 'строка1\nстрока2')).toBe(
            '> <@bob:example.org> строка1\n> строка2\n\n'
        );
    });
});

describe('trimReplyFromBody', () => {
    it('удаляет цитату-заглушку', () => {
        const body = '> <@alice:example.org> Привет\n\nТекст ответа';
        expect(trimReplyFromBody(body)).toBe('Текст ответа');
    });

    it('не трогает обычный текст', () => {
        expect(trimReplyFromBody('Обычное сообщение')).toBe('Обычное сообщение');
    });

    it('трогает многострочные цитаты', () => {
        const body = '> <@alice:example.org> строка1\n> строка2\n\nОтвет';
        expect(trimReplyFromBody(body)).toBe('Ответ');
    });

    it('не ломается на пустой строке', () => {
        expect(trimReplyFromBody('')).toBe('');
    });
});

describe('trimReplyFromFormattedBody', () => {
    it('удаляет блок mx-reply', () => {
        const fb =
            '<mx-reply><blockquote>в цитате</blockquote></mx-reply>Текст ответа';
        expect(trimReplyFromFormattedBody(fb)).toBe('Текст ответа');
    });

    it('не трогает HTML без mx-reply', () => {
        expect(trimReplyFromFormattedBody('<b>plain</b>')).toBe('<b>plain</b>');
    });
});

describe('buildReplyContent', () => {
    it('строит content с цитатой и m.in_reply_to', () => {
        const target = { id: '$r1', sender: '@alice:example.org', body: 'Привет' };
        const content = buildReplyContent(target, 'В ответ: всё ок');

        expect(content.msgtype).toBe('m.text');
        expect(content.body).toContain('> <@alice:example.org> Привет');
        expect(content.body).toContain('В ответ: всё ок');
        expect(content['m.relates_to']['m.in_reply_to'].event_id).toBe('$r1');
    });
});

describe('buildEditContent', () => {
    const makeEvent = (id: string, content: Record<string, unknown>): MatrixEvent => ({
        getId: () => id,
        getWireContent: () => content,
    }) as never as MatrixEvent;

    it('строит правку текста', () => {
        const event = makeEvent('$m1', { msgtype: 'm.text', body: 'старый текст' });
        const content = buildEditContent(event, 'новый текст');

        expect(content.msgtype).toBe('m.text');
        expect(content.body).toBe('* новый текст');
        expect(content['m.new_content'].body).toBe('новый текст');
        expect(content['m.new_content'].msgtype).toBe('m.text');
        expect(content['m.relates_to'].rel_type).toBe('m.replace');
        expect(content['m.relates_to'].event_id).toBe('$m1');
    });

    it('сохраняет m.new_content при редактировании ответа', () => {
        const replyTarget = { 'm.in_reply_to': { event_id: '$r1' } };
        const event = makeEvent('$m1', {
            msgtype: 'm.text',
            body: '> <@alice:example.org> Привет\n\nВ ответ',
            'm.relates_to': { 'm.in_reply_to': { event_id: '$r1' } },
        });
        const content = buildEditContent(event, 'оправился');

        expect(content['m.new_content']['m.relates_to']['m.in_reply_to'].event_id).toBe('$r1');
        expect(content['m.new_content'].body).toBe('оправился');
        expect(content.body).toBe('* оправился');
    });

    it('по умолчанию msgtype = m.text, если wire-контента нет', () => {
        const event = makeEvent('$m1', {});
        const content = buildEditContent(event, 'текст');
        expect(content.msgtype).toBe('m.text');
    });
});

describe('getReactionContent', () => {
    it('строит content реакции', () => {
        const content = getReactionContent('$m1', '👍');
        expect(content['m.relates_to'].event_id).toBe('$m1');
        expect(content['m.relates_to'].rel_type).toBe('m.annotation');
        expect(content['m.relates_to'].key).toBe('👍');
    });
});
