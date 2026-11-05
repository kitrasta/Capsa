// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../shared/lib/matrix', () => ({
    otkConflict: {
        getState: vi.fn(),
        subscribe: vi.fn(),
    },
    matrixLifecycle: {
        logout: vi.fn(),
    },
}));

import OtkConflictBanner from './OtkConflictBanner';
import { otkConflict, matrixLifecycle } from '../../shared/lib/matrix';

describe('OtkConflictBanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(otkConflict.subscribe).mockReturnValue(() => undefined);
    });

    afterEach(cleanup);

    it('не рендерится без конфликта', () => {
        vi.mocked(otkConflict.getState).mockReturnValue({ conflict: false });
        const { container } = render(<MemoryRouter><OtkConflictBanner /></MemoryRouter>);
        expect(container.firstChild).toBeNull();
    });

    it('показывает объяснение и кнопку выхода при конфликте', () => {
        vi.mocked(otkConflict.getState).mockReturnValue({ conflict: true });
        render(<MemoryRouter><OtkConflictBanner /></MemoryRouter>);
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText(/конфликтуют с сервером/i)).toBeTruthy();
    });

    it('кнопка «Выйти» вызывает logout', () => {
        vi.mocked(otkConflict.getState).mockReturnValue({ conflict: true });
        vi.mocked(matrixLifecycle.logout).mockResolvedValue(undefined);
        render(<MemoryRouter><OtkConflictBanner /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: /выйти/i }));
        expect(matrixLifecycle.logout).toHaveBeenCalledTimes(1);
    });
});
