// Позиция скролла ленты: находимся ли у нижнего края.
// От этого флага зависит автоскролл (и markRead в компоненте).
// Компенсация скролла при пагинации остаётся в компоненте — она тесно
// связана с DOM-узлом ленты и якорем подгрузки истории.
import { useEffect, useRef, useState, type RefObject } from 'react';

// до скольки px от низа юзер считается «у нижнего края»
const BOTTOM_THRESHOLD = 100;

export interface ScrollState {
    /** юзер у нижнего края ленты — новые сообщения подскролливаем */
    isAtBottom: boolean;
    /** sentinel в конце ленты: цель автоскролла */
    bottomRef: RefObject<HTMLDivElement | null>;
    /** вызывать из onScroll контейнера; возвращает, у края ли юзер сейчас */
    updateScrollPosition: (el: HTMLElement) => boolean;
    /** юзер отправил сообщение — показать его, даже если читал историю выше */
    forceScrollToBottom: () => void;
}

export const useScrollPosition = (messagesLength: number): ScrollState => {
    // при открытии комнаты юзер всегда видит низ
    const [isAtBottom, setIsAtBottom] = useState(true);
    // ref дублирует флаг: автоскролл читает его синхронно в момент прихода
    // сообщений, а не из замыкания эффекта (как раньше wasAtBottomRef)
    const isAtBottomRef = useRef(true);
    const bottomRef = useRef<HTMLDivElement>(null);

    const updateScrollPosition = (el: HTMLElement): boolean => {
        const atBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
        return atBottom;
    };

    const forceScrollToBottom = () => {
        isAtBottomRef.current = true;
        setIsAtBottom(true);
    };

    // автоскролл вниз — только если юзер был у нижнего края.
    // Ключ — длина ленты: компонент пересоздаётся на каждую комнату
    // (key={roomId}), поэтому отдельная зависимость от roomId не нужна
    useEffect(() => {
        if (isAtBottomRef.current) {
            bottomRef.current?.scrollIntoView({ block: 'end' });
        }
    }, [messagesLength]);

    return { isAtBottom, bottomRef, updateScrollPosition, forceScrollToBottom };
};
