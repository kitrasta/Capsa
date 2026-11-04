// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LazyRouteErrorBoundary from './LazyRouteErrorBoundary';

// компонент, который падает так же, как React.lazy при rejected import
const Broken = () => {
    throw new TypeError('Failed to fetch dynamically imported module');
};

describe('LazyRouteErrorBoundary', () => {
    afterEach(cleanup);

    it('показывает recovery UI и перезагружает страницу по кнопке', async () => {
        const reload = vi.fn();
        render(
            <LazyRouteErrorBoundary reload={reload}>
                <Broken />
            </LazyRouteErrorBoundary>,
        );

        expect(
            screen.getByText(/не удалось загрузить страницу/i),
        ).toBeTruthy();

        fireEvent.click(
            screen.getByRole('button', { name: /перезагрузить/i }),
        );
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('рендерит children, если ошибки нет', () => {
        render(
            <LazyRouteErrorBoundary reload={vi.fn()}>
                <div>Контент страницы</div>
            </LazyRouteErrorBoundary>,
        );
        expect(screen.getByText('Контент страницы')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
