// Презентационный компонент пузыря: на вход — только снимок MessageView.
import DOMPurify from 'dompurify';
import { memo, useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Reply } from 'lucide-react';
import type { MessageView } from './messageView';
import { sameMessageView } from './messageView';
import styles from './MessageBubble.module.css';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👎'] as const;

const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    });

const sanitizeHtml = (html: string): string =>
    DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'b', 'strong', 'i', 'em', 'u', 's', 'del', 'code', 'pre',
            'a', 'br', 'p', 'span', 'ul', 'ol', 'li', 'blockquote',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
        ],
        ALLOWED_ATTR: ['href', 'title', 'rel'],
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

const MessageBubble = memo(
    ({ message, grouped, onReply, onEdit, onToggleReaction, onReplyClick }: MessageBubbleProps) => {
        const [actionsOpen, setActionsOpen] = useState(false);
        const sanitizedHtml = useMemo(
            () => (message.formattedBody ? sanitizeHtml(message.formattedBody) : null),
            [message.formattedBody],
        );

        const closeActions = () => setActionsOpen(false);

        return (
            <div
                className={`${styles.message} ${message.isOwn ? styles.own : ''} ${grouped ? styles.grouped : ''}`}
                data-event-id={message.id}
            >
                <div className={styles.bubble}>
                    {!message.isOwn && !grouped && (
                        <div className={styles.senderName}>{message.senderName}</div>
                    )}

                    {message.replyTo && (
                        <button
                            type="button"
                            className={styles.replyPreview}
                            onClick={() => onReplyClick?.(message.replyTo!.id)}
                            aria-label="Перейти к ответу"
                        >
                            <Reply className={styles.replyArrow} size={14} />
                            <span className={styles.replyContent}>
                                {message.replyTo.senderName && (
                                    <span className={styles.replySender}>
                                        {message.replyTo.senderName}
                                    </span>
                                )}
                                <span className={styles.replyBody}>{message.replyTo.body}</span>
                            </span>
                        </button>
                    )}

                    <div className={styles.bodyRow}>
                        {sanitizedHtml ? (
                            <div
                                className={styles.textHtml}
                                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                            />
                        ) : (
                            <div className={styles.text}>{message.body}</div>
                        )}
                        <div className={styles.time}>
                            {message.isEdited && <span className={styles.edited}>изм.</span>}
                            <span>{formatTime(message.ts)}</span>
                            {message.sendStatus && (
                                <span className={styles.status}>{message.sendStatus}</span>
                            )}
                        </div>
                    </div>
                </div>

                {message.reactions.length > 0 && (
                    <div className={styles.reactions}>
                        {message.reactions.map((reaction) => (
                            <button
                                type="button"
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

                <button
                    type="button"
                    className={styles.mobileActionsButton}
                    onClick={() => setActionsOpen((open) => !open)}
                    aria-label="Действия с сообщением"
                    aria-expanded={actionsOpen}
                >
                    <MoreHorizontal size={18} />
                </button>

                <div className={`${styles.actions} ${actionsOpen ? styles.actionsOpen : ''}`}>
                    {QUICK_REACTIONS.map((emoji) => (
                        <button
                            type="button"
                            key={emoji}
                            className={styles.reactionAction}
                            onClick={() => {
                                closeActions();
                                onToggleReaction?.(message.id, emoji);
                            }}
                            aria-label={`Добавить реакцию ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={styles.action}
                        onClick={() => {
                            closeActions();
                            onReply?.(message);
                        }}
                        aria-label="Ответить"
                    >
                        <Reply size={16} />
                    </button>
                    {message.canEdit && (
                        <button
                            type="button"
                            className={styles.action}
                            onClick={() => {
                                closeActions();
                                onEdit?.(message);
                            }}
                            aria-label="Редактировать"
                        >
                            <Pencil size={15} />
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
