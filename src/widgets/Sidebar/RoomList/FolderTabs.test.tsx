// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Room } from 'matrix-js-sdk';
import FolderTabs from './FolderTabs';

const space = (roomId: string, name: string): Room => ({ roomId, name }) as Room;

describe('FolderTabs', () => {
    afterEach(cleanup);

    it('показывает корни, unread и текущий путь без раскрытого дерева', () => {
        const root = space('!root:example.org', 'Компания');
        const child = space('!child:example.org', 'Разработка');
        const openRoot = vi.fn();
        const openBreadcrumb = vi.fn();
        const showAll = vi.fn();

        render(
            <FolderTabs
                roots={[root]}
                path={[root, child]}
                unreadBySpace={new Map([[root.roomId, 3]])}
                onOpenRoot={openRoot}
                onOpenBreadcrumb={openBreadcrumb}
                onShowAll={showAll}
            />,
        );

        expect(screen.getByRole('button', { name: 'Все' })).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /Компания/ })).toHaveLength(2);
        expect(screen.getByText('3')).toBeTruthy();
        expect(screen.getByRole('navigation', { name: 'Путь' }).textContent).toContain(
            'Компания/Разработка',
        );

        const breadcrumbs = screen.getAllByRole('button', { name: 'Компания' });
        fireEvent.click(breadcrumbs[breadcrumbs.length - 1]);
        expect(openBreadcrumb).toHaveBeenCalledWith(0);
        fireEvent.click(screen.getByRole('button', { name: 'Все' }));
        expect(showAll).toHaveBeenCalledTimes(1);
    });
});
