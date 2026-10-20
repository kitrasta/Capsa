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
    it('успех: отправляет текст', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.send('hello');
        });

        expect(sendTextMessage).toHaveBeenCalledWith(ROOM_ID, 'hello');
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
