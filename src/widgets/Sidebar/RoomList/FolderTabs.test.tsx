// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { Room } from 'matrix-js-sdk';
import FolderTabs from './FolderTabs';

const space = (roomId: string, name: string): Room => ({ roomId, name }) as Room;

describe('FolderTabs', () => {
    afterEach(cleanup);

    it('показывает постоянные фильтры и не превращает Spaces в вкладки', () => {
        const setFilter = vi.fn();
        render(
            <FolderTabs
                filter="all"
                path={[]}
                onFilterChange={setFilter}
                onOpenBreadcrumb={vi.fn()}
                onShowAll={vi.fn()}
            />,
        );

        const filters = screen.getByRole('group', { name: 'Фильтры чатов' });
        expect(within(filters).getAllByRole('button').map((button) => button.textContent)).toEqual([
            'Все',
            'Новые',
            'Личные',
        ]);
        expect(within(filters).getByRole('button', { name: 'Все' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(within(filters).getByRole('button', { name: 'Новые' }));
        expect(setFilter).toHaveBeenCalledWith('unread');
        fireEvent.click(within(filters).getByRole('button', { name: 'Личные' }));
        expect(setFilter).toHaveBeenCalledWith('direct');
    });

    it('показывает компактный путь с корнем и вызывает навигацию по одному уровню', () => {
        const root = space('!root:example.org', 'Компания');
        const child = space('!child:example.org', 'Разработка');
        const openBreadcrumb = vi.fn();
        const showAll = vi.fn();

        render(
            <FolderTabs
                filter="unread"
                path={[root, child]}
                onFilterChange={vi.fn()}
                onOpenBreadcrumb={openBreadcrumb}
                onShowAll={showAll}
            />,
        );

        const breadcrumbs = screen.getByRole('navigation', { name: 'Путь' });
        expect(breadcrumbs.textContent).toBe('Все/Компания/Разработка');
        fireEvent.click(within(breadcrumbs).getByRole('button', { name: 'Компания' }));
        expect(openBreadcrumb).toHaveBeenCalledWith(0);
        fireEvent.click(within(breadcrumbs).getByRole('button', { name: 'Все' }));
        expect(showAll).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Новые' }).getAttribute('aria-pressed')).toBe('true');
    });
});
