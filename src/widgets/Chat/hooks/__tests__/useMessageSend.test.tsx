// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('../../../../shared/lib/matrix', () => ({
    getClient: vi.fn(),
    sendReplyMessage: vi.fn(),
    editMessage: vi.fn(),
    toggleReaction: vi.fn(),
}));

import {
    getClient,
    sendReplyMessage,
    editMessage,
    toggleReaction as toggleReactionApi,
} from '../../../../shared/lib/matrix';
import { useMessageSend } from '../useMessageSend';

const ROOM_ID = '!room:example.org';

const sendTextMessage = vi.fn(async () => ({}));
const sendTyping = vi.fn(async () => ({}));

const render = () => renderHook(() => useMessageSend(ROOM_ID));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockReturnValue({
        sendTextMessage,
        sendTyping,
    } as unknown as ReturnType<typeof getClient>);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useMessageSend: send', () => {
    it('успех: отправляет обычный текст без лишнего transaction id', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.send('hello');
        });

        expect(sendTextMessage).toHaveBeenCalledWith(ROOM_ID, 'hello');
        expect(sendReplyMessage).not.toHaveBeenCalled();
    });

    it('ошибка: send пробрасывает её — компонент вернёт текст в input', async () => {
        const error = new Error('network down');
        sendTextMessage.mockRejectedValueOnce(error);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result } = render();

        await expect(result.current.send('hello')).rejects.toThrow('network down');
    });
});

describe('useMessageSend: reply', () => {
    it('отправляет ответ через Matrix API с m.in_reply_to', async () => {
        const { result } = render();
        const target = { id: '$r1', sender: '@alice:example.org', body: 'Привет' };

        await act(async () => {
            await result.current.send('В ответ', target);
        });

        expect(sendReplyMessage).toHaveBeenCalledWith(ROOM_ID, target, 'В ответ');
        expect(sendTextMessage).not.toHaveBeenCalled();
    });
});

describe('useMessageSend: edit', () => {
    it('делегирует правку Matrix API', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.edit('$m1', 'новый текст');
        });

        expect(editMessage).toHaveBeenCalledWith(ROOM_ID, '$m1', 'новый текст');
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

        now.mockReturnValue(2000);
        act(() => result.current.typing('ab'));
        expect(sendTyping).toHaveBeenCalledTimes(1);

        now.mockReturnValue(11_001);
        act(() => result.current.typing('abc'));
        expect(sendTyping).toHaveBeenCalledTimes(2);
        expect(sendTyping).toHaveBeenCalledWith(ROOM_ID, true, 20_000);
    });

    it('пустое поле: typing=false и сброс интервала', () => {
        const now = vi.spyOn(Date, 'now');
        const { result } = render();

        now.mockReturnValue(1000);
        act(() => result.current.typing('a'));
        expect(sendTyping).toHaveBeenCalledWith(ROOM_ID, true, 20_000);

        now.mockReturnValue(2000);
        act(() => result.current.typing(''));
        expect(sendTyping).toHaveBeenLastCalledWith(ROOM_ID, false, 20_000);

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
    it('делегирует переключение реакции Matrix API без рекурсии', async () => {
        const { result } = render();

        await act(async () => {
            await result.current.toggleReaction('$m1', '👍');
        });

        expect(toggleReactionApi).toHaveBeenCalledTimes(1);
        expect(toggleReactionApi).toHaveBeenCalledWith(ROOM_ID, '$m1', '👍');
    });
});
