// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { getClient } from '../../../../shared/lib/matrix';
import { useMessageSend } from '../useMessageSend';

const ROOM_ID = '!room:example.org';

const sendTextMessage = vi.fn(async () => {});
const sendTyping = vi.fn(async () => {});

const render = () => renderHook(() => useMessageSend(ROOM_ID));

beforeEach(() => {
    sendTextMessage.mockClear();
    sendTyping.mockClear();
    vi.mocked(getClient).mockReset();
    vi.mocked(getClient).mockReturnValue({
        sendTextMessage,
        sendTyping,
    } as unknown as ReturnType<typeof getClient>);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useMessageSend: send', () => {
    it('успех: отправляет текст с базовым content', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.send('hello');
        });

        expect(sendTextMessage).toHaveBeenCalledWith(
            ROOM_ID,
            'hello',
            expect.objectContaining({ msgtype: 'm.text', body: 'hello' }),
        );
    });

    it('ошибка: send пробрасывает её — компонент вернёт текст в input', async () => {
        const error = new Error('network down');
        sendTextMessage.mockRejectedValueOnce(error);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = render();

        // ChatView ловит reject и делает setText(value) — здесь проверяем
        // контракт хука: reject с исходной ошибкой, а не тихий провал
        await expect(result.current.send('hello')).rejects.toThrow('network down');
    });
});

describe('useMessageSend: reply', () => {
    it('отправляет цитату с m.in_reply_to', async () => {
        const { result } = render();
        const target = { id: '$r1', sender: '@alice:example.org', body: 'Привет' };

        await act(async () => {
            await result.current.send('В ответ', target);
        });

        const content = vi.mocked(getClient()).sendTextMessage.mock.calls[0]?.[2] as Record<string, unknown>;
        expect(content['m.relates_to']['m.in_reply_to'].event_id).toBe('$r1');
        expect(content.body).toContain('> <@alice:example.org> Привет');
        expect(content.body).toContain('В ответ');
    });
});

describe('useMessageSend: edit', () => {
    beforeEach(() => {
        vi.mocked(getClient()).getRoom().findEventById.mockReset();
    });

    it('отправляет правку с m.replace + m.new_content', async () => {
        vi.mocked(getClient()).getRoom().findEventById.mockReturnValueOnce({
            getId: () => '$m1',
            getWireContent: () => ({ msgtype: 'm.text', body: 'старый текст' }),
        } as never);
        const { result } = render();

        await act(async () => {
            await result.current.edit('$m1', 'новый текст');
        });

        const content = vi.mocked(getClient()).sendMessage.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(content).toEqual(
            expect.objectContaining({
                'm.relates_to': { rel_type: 'm.replace', event_id: '$m1' },
                'm.new_content': { msgtype: 'm.text', body: 'новый текст' },
                body: '* новый текст',
            }),
        );
    });
});

describe('useMessageSend: typing', () => {
    it('шлёт typing=true, но не чаще раза в 10 секунд', () => {
        const now = vi.spyOn(Date, 'now');
        const { result } = render();

        now.mockReturnValue(1000);
        act(() => result.current.typing('a'));
        expect(sendTyping).toHaveBeenCalledTimes(1);
        expect(sendTyping).toHaveBeenCalledWith(ROOM_ID, true, 20_000);

        // меньше 10 c — повторно не шлём
        now.mockReturnValue(2000);
        act(() => result.current.typing('ab'));
        expect(sendTyping).toHaveBeenCalledTimes(1);

        // интервал прошёл — шлём снова
        now.mockReturnValue(11_001);
        act(() => result.current.typing('abc'));
        expect(sendTyping).toHaveBeenCalledTimes(2);
    });

    it('пустое поле: typing=false и сброс интервала', () => {
        const now = vi.spyOn(Date, 'now');
        const { result } = render();

        now.mockReturnValue(1000);
        act(() => result.current.typing('a'));
        expect(sendTyping).toHaveBeenLastCalledWith(ROOM_ID, true, 20_000);

        now.mockReturnValue(2000);
        act(() => result.current.typing(''));
        expect(sendTyping).toHaveBeenLastCalledWith(ROOM_ID, false, 20_000);

        // интервал сброшен — сразу можно «печатать» снова
        now.mockReturnValue(2100);
        act(() => result.current.typing('b'));
        expect(sendTyping).toHaveBeenCalledTimes(3);
        expect(sendTyping).toHaveBeenLastCalledWith(ROOM_ID, true, 20_000);
    });

    it('пробелы в поле считаются пустым текстом', () => {
        const { result } = render();

        act(() => result.current.typing('   '));
        expect(sendTyping).toHaveBeenCalledWith(ROOM_ID, false, 20_000);
    });
});

describe('useMessageSend: toggleReaction', () => {
    const mockRoom = {
        findEventById: vi.fn(),
        getUnfilteredTimelineSet: vi.fn(() => ({
            relations: {
                getChildEventsForEvent: vi.fn(() => ({ getSortedAnnotationsByKey: () => [] })),
            },
        })),
    };

    beforeEach(() => {
        vi.mocked(getClient).mockReturnValue({
            sendTextMessage,
            sendTyping,
            redactEvent: vi.fn(async () => ({})),
            sendEvent: vi.fn(async () => ({})),
            getRoom: () => mockRoom,
        } as unknown as ReturnType<typeof getClient>);
    });

    it('добавляет новую реакцию', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.toggleReaction('$m1', '👍');
        });

        expect(vi.mocked(getClient()).sendEvent).toHaveBeenCalledWith(
            ROOM_ID,
            'm.reaction',
            expect.objectContaining({
                'm.relates_to': { event_id: '$m1', rel_type: 'm.annotation', key: '👍' },
            }),
        );
    });

    it('удаляет свою реакцию через redactEvent', async () => {
        const myReaction: unknown = {
            getSender: () => '@me:example.org',
            isRelation: () => true,
            getId: () => '$reaction',
        };
        vi.mocked(getClient()).getRoom().getUnfilteredTimelineSet().relations.getChildEventsForEvent.mockReturnValueOnce({
            getSortedAnnotationsByKey: () => [['👍', new Set([myReaction as never])]],
        });
        const { result } = render();

        await act(async () => {
            await result.current.toggleReaction('$m1', '👍');
        });

        expect(vi.mocked(getClient()).redactEvent).toHaveBeenCalledWith(ROOM_ID, '$reaction');
    });
});
