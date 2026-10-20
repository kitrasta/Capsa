import DOMPurify from 'dompurify';
import { memo, useMemo } from 'react';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { EventStatus } from 'matrix-js-sdk';
import styles from './MessageBubble.module.css';

// Чистовой (презентационный) компонент: на вход — только видимые данные,
// никаких SDK-объектов. MatrixEvent мутирует (расшифровка, статус отправки)
// при неизменном identity — memo по объекту события ничего бы не заметил,
// а по снимку данных пропускает ре-рендеры всех, кроме изменившегося пузыря.
export interface MessageView {
    id: string;
    body: string;
    formattedBody: string | null;
    senderName: string;
    ts: number;
    sendStatus: string | null;
    isOwn: boolean;
}

const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });

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

// чужой HTML нельзя рендерить напрямую (XSS):
// только после санитайзинга, с минимальным набором тегов
const sanitizeHtml = (html: string): string =>
    DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'b', 'strong', 'i', 'em', 'u', 's', 'del', 'code', 'pre',
            'a', 'br', 'p', 'span', 'ul', 'ol', 'li', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
        ],
        // class не разрешаем: чужой HTML мог бы притянуть наши же
        // CSS-классы (styles.own и т.п.) и перекрасить пузырь
        ALLOWED_ATTR: ['href', 'title', 'rel'],
        // ссылки — только http(s) и matrix-схемы
        ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|matrix:)/i,
    });

// снимок видимых данных события на момент рендера.
// Вызывается в родителе на каждый рендер ленты — это дёшево (чтение полей),
// а тяжёлый рендер пузыря memo пропускает, пока снимок не изменился.
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

const MessageBubble = memo(({ body, formattedBody, senderName, ts, sendStatus, isOwn }: MessageView) => {
    // санитайзинг — дорогой (парсинг DOM): гоняем только когда
    // меняется сам HTML, а не на каждый ре-рендер ленты
    const sanitizedHtml = useMemo(
        () => (formattedBody ? sanitizeHtml(formattedBody) : null),
        [formattedBody],
    );

    return (
        <div className={`${styles.message} ${isOwn ? styles.own : ''}`}>
            {!isOwn && (
                <div className={styles.senderName}>{senderName}</div>
            )}
            <div className={styles.bubble}>
                {sanitizedHtml ? (
                    <div
                        className={styles.textHtml}
                        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                    />
                ) : (
                    <div className={styles.text}>{body}</div>
                )}
                <div className={styles.time}>
                    {formatTime(ts)}
                    {sendStatus && <span className={styles.status}>{sendStatus}</span>}
                </div>
            </div>
        </div>
    );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
