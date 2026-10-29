// Чистовой (презентационный) компонент пузыря сообщения: на вход — только
// видимые данные (MessageView), никаких SDK-объектов. React.memo сравнивает
// их поверхностно и пропускает ре-рендеры всех, кроме изменившегося пузыря.
// Данные собирает toMessageView (messageView.ts).
import DOMPurify from 'dompurify';
import { memo, useMemo } from 'react';
import type { MessageView } from './messageView';
import styles from './MessageBubble.module.css';

const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });

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

const MessageBubble = memo(({ body, formattedBody, senderName, ts, sendStatus, isOwn, grouped }: MessageView & { grouped?: boolean }) => {
    // санитайзинг — дорогой (парсинг DOM): гоняем только когда
    // меняется сам HTML, а не на каждый ре-рендер ленты
    const sanitizedHtml = useMemo(
        () => (formattedBody ? sanitizeHtml(formattedBody) : null),
        [formattedBody],
    );

    return (
        <div className={`${styles.message} ${isOwn ? styles.own : ''} ${grouped ? styles.grouped : ''}`}>
            {!isOwn && !grouped && (
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
