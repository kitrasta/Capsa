// Константы Matrix-чата: размеры страниц, пороги скролла и тайминги.
export const SCROLLBACK_PAGE = 40;
export const SCROLL_LOAD_THRESHOLD = 100; // px от верха, когда тянем историю
// разрыв, после которого подряд идущие сообщения одного автора
// перестают считаться одной группой (Telegram-стиль)
export const MESSAGE_GROUP_TIME_GAP = 5 * 60_000;
export const TYPING_SEND_INTERVAL = 10_000;
export const TYPING_TIMEOUT = 20_000;
