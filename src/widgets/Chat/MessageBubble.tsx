// Чистовой (презентационный) компонент пузыря сообщения: на вход — только
// видимые данные (MessageView), никаких SDK-объектов. React.memo сравнивает
// их через sameMessageView и пропускает ре-рендеры всех, кроме изменившегося
// пузыря. Данные собирает toMessageView (messageView.ts).
import DOMPurify from 'dompurify';
import { memo, useMemo } from 'react';
import type { MessageView } from './messageView';
import { sameMessageView } from './messageView';
import styles from './MessageBubble.module.css';

// Быстрые реакции в духе Telegram (реакции-иконки): добавляются сразу,
// без выбора в отдельном меню.
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👎'] as const;

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

export interface MessageBubbleProps {
    message: MessageView;
    grouped?: boolean;
    onReply?: (message: MessageView) => void;
    onEdit?: (message: MessageView) => void;
    onToggleReaction?: (messageId: string, key: string) => void;
    onReplyClick?: (messageId: string) => void;
}

// React.memo передаёт comparator'у props целиком, а не только MessageView.
// Сравниваем снимок сообщения и остальные props отдельно.
const sameMessageBubbleProps = (
    prev: Readonly<MessageBubbleProps>,
    next: Readonly<MessageBubbleProps>,
): boolean =>
    sameMessageView(prev.message, next.message) &&
    prev.grouped === next.grouped &&
    prev.onReply === next.onReply &&
    prev.onEdit === next.onEdit &&
    prev.onToggleReaction === next.onToggleReaction &&
    prev.onReplyClick === next.onReplyClick;

// memo нужен для оптимизации: при пересчёте ленты (новая страница истории,
// расшифровка, реакция/правка) перерисовываются только пузыри, которые
// визуально изменились.
const MessageBubble = memo(
    ({ message, grouped, onReply, onEdit, onToggleReaction, onReplyClick }: MessageBubbleProps) => {
        // санитайзинг — дорогой (парсинг DOM): гоняем только когда
        // меняется сам HTML, а не на каждый ре-рендер ленты
        const sanitizedHtml = useMemo(
            () => (message.formattedBody ? sanitizeHtml(message.formattedBody) : null),
            [message.formattedBody],
        );

        return (
            <div
                className={`${styles.message} ${message.isOwn ? styles.own : ''} ${grouped ? styles.grouped : ''}`}
                data-event-id={message.id}
            >
                {!message.isOwn && !grouped && <div className={styles.senderName}>{message.senderName}</div>}

                {message.replyTo && (
                    <button
                        className={styles.replyPreview}
                        onClick={() => onReplyClick?.(message.replyTo!.id)}
                        aria-label="Перейти к ответу"
                    >
                        <span className={styles.replyArrow}>↩</span>
                        {message.replyTo.senderName && (
                            <span className={styles.replySender}>{message.replyTo.senderName}</span>
                        )}
                        <span className={styles.replyBody}>{message.replyTo.body}</span>
                    </button>
                )}

                <div className={styles.bubble}>
                    {sanitizedHtml ? (
                        <div className={styles.textHtml} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
                    ) : (
                        <div className={styles.text}>{message.body}</div>
                    )}
                    <div className={styles.time}>
                        {formatTime(message.ts)}
                        {message.isEdited && <span className={styles.edited}>изм.</span>}
                        {message.sendStatus && <span className={styles.status}>{message.sendStatus}</span>}
                    </div>
                </div>

                {message.reactions.length > 0 && (
                    <div className={styles.reactions}>
                        {message.reactions.map((reaction) => (
                            <button
                                key={reaction.key}
                                className={`${styles.reactionButton} ${reaction.mine ? styles.mine : ''}`}
                                onClick={() => onToggleReaction?.(message.id, reaction.key)}
                                aria-pressed={reaction.mine}
                            >
                                <span>{reaction.key}</span>
                                <span>{reaction.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className={styles.actions}>
                    {QUICK_REACTIONS.map((emoji) => (
                        <button
                            key={emoji}
                            className={styles.reactionAction}
                            onClick={() => onToggleReaction?.(message.id, emoji)}
                            aria-label={`Добавить реакцию ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                    <button className={styles.action} onClick={() => onReply?.(message)} aria-label="Ответить">
                        ↩
                    </button>
                    {message.canEdit && (
                        <button className={styles.action} onClick={() => onEdit?.(message)} aria-label="Редактировать">
                            ✏
                        </button>
                    )}
                </div>
            </div>
        );
    },
    sameMessageBubbleProps,
);

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
