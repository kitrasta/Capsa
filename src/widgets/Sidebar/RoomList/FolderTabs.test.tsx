// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FolderTabs from './FolderTabs';

describe('FolderTabs', () => {
    afterEach(cleanup);

    it('показывает только постоянные фильтры и переключает их', () => {
        const setFilter = vi.fn();
        render(<FolderTabs filter="all" onFilterChange={setFilter} />);

        const filters = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filters).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Все',
            'Новые',
            'Личные',
        ]);
        expect(within(filters).getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.queryByRole('navigation', { name: 'Путь' })).toBeNull();
        fireEvent.click(within(filters).getByRole('button', { name: 'Новые' }));
        expect(setFilter).toHaveBeenCalledWith('unread');
        fireEvent.click(within(filters).getByRole('button', { name: 'Личные' }));
        expect(setFilter).toHaveBeenCalledWith('direct');
    });
});
