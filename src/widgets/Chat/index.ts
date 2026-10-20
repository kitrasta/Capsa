// Публичный API виджета Chat: наружу — только ChatView.
// Хуки, constants и MessageBubble — внутренние детали реализации:
// страница не должна знать, из чего собран виджет.
export { default as ChatView } from './ChatView';
