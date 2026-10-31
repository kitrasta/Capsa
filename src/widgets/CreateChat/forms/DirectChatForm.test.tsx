// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../shared/lib/matrix', () => ({
    createDirectChat: vi.fn(),
    searchUsers: vi.fn(),
}));

import DirectChatForm from './DirectChatForm';
import { createDirectChat, searchUsers } from '../../../shared/lib/matrix';

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('DirectChatForm', () => {
    it('открывает DM с выбранным пользователем и возвращает roomId', async () => {
        vi.mocked(searchUsers).mockResolvedValue([
            { userId: '@alice:example.org', displayName: 'Alice' },
        ]);
        vi.mocked(createDirectChat).mockResolvedValue('!dm:example.org');
        const onDone = vi.fn();
        render(<DirectChatForm onDone={onDone} />);

        fireEvent.change(screen.getByPlaceholderText('Найти пользователя'), {
            target: { value: 'alice' },
        });
        await act(async () => {
            vi.advanceTimersByTime(400);
        });
        fireEvent.click(screen.getByRole('button', { name: 'Открыть чат с Alice' }));
        await act(async () => {
            await Promise.resolve();
        });

        expect(createDirectChat).toHaveBeenCalledWith('@alice:example.org');
        expect(onDone).toHaveBeenCalledWith('!dm:example.org');
    });
});
