// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../shared/lib/matrix', () => ({
    createGroup: vi.fn(),
    searchUsers: vi.fn(),
}));

import GroupForm from './GroupForm';
import { searchUsers, type UserSearchResult } from '../../../shared/lib/matrix';

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return { promise, resolve };
};

const openMembersStep = () => {
    render(<GroupForm onDone={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Название группы'), {
        target: { value: 'Команда' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    return screen.getByPlaceholderText('Поиск участников');
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('GroupForm: гонки поиска участников', () => {
    it('показывает только результат актуального запроса', async () => {
        const alice = deferred<UserSearchResult[]>();
        const bob = deferred<UserSearchResult[]>();
        vi.mocked(searchUsers)
            .mockImplementationOnce(() => alice.promise)
            .mockImplementationOnce(() => bob.promise);
        const input = openMembersStep();

        fireEvent.change(input, { target: { value: 'alice' } });
        await act(async () => {
            vi.advanceTimersByTime(400);
        });
        fireEvent.change(input, { target: { value: 'bob' } });
        await act(async () => {
            vi.advanceTimersByTime(400);
        });

        await act(async () => {
            bob.resolve([{ userId: '@bob:example.org', displayName: 'Bob' }]);
            await Promise.resolve();
        });
        expect(screen.getByText('Bob')).toBeTruthy();

        await act(async () => {
            alice.resolve([{ userId: '@alice:example.org', displayName: 'Alice' }]);
            await Promise.resolve();
        });
        expect(screen.getByText('Bob')).toBeTruthy();
        expect(screen.queryByText('Alice')).toBeNull();
    });

    it('не восстанавливает результаты завершившегося запроса после очистки', async () => {
        const pending = deferred<UserSearchResult[]>();
        vi.mocked(searchUsers).mockImplementation(() => pending.promise);
        const input = openMembersStep();

        fireEvent.change(input, { target: { value: 'alice' } });
        await act(async () => {
            vi.advanceTimersByTime(400);
        });
        fireEvent.change(input, { target: { value: '' } });

        await act(async () => {
            pending.resolve([{ userId: '@alice:example.org', displayName: 'Alice' }]);
            await Promise.resolve();
        });

        expect(screen.queryByText('Alice')).toBeNull();
    });
});
