import DOMPurify from 'dompurify';
import type { MatrixEvent, Room } from 'matrix-js-sdk';
import { EventStatus } from 'matrix-js-sdk';
import styles from './MessageBubble.module.css';

interface Props {
    event: MatrixEvent;
    room: Room;
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
        ALLOWED_ATTR: ['href', 'title', 'class', 'rel'],
        // ссылки — только http(s) и matrix-схемы
        ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:|matrix:)/i,
    });

const MessageBubble = ({ event, room, isOwn }: Props) => {
    const body = event.getContent<{ body?: string }>().body ?? '';
    const formattedBody = getFormattedBody(event);
    const senderId = event.getSender() ?? '';
    const senderName = room.currentState.getMember(senderId)?.name ?? senderId;
    const ts = event.getTs();
    const sendStatus = isOwn ? getSendStatus(event) : null;

    return (
        <div className={`${styles.message} ${isOwn ? styles.own : ''}`}>
            {!isOwn && (
                <div className={styles.senderName}>{senderName}</div>
            )}
            <div className={styles.bubble}>
                {formattedBody ? (
                    <div
                        className={styles.textHtml}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(formattedBody) }}
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
};

export default MessageBubble;
