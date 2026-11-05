// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AppearanceSettingsPage from './AppearanceSettingsPage';
import { getAppearanceSettings, setAppearanceSettings } from '../shared/lib/appearance';

describe('AppearanceSettingsPage', () => {
    beforeEach(() => {
        localStorage.clear();
        setAppearanceSettings({ theme: 'system' });
    });

    afterEach(cleanup);

    it('позволяет выбрать системную, светлую и тёмную тему', () => {
        render(<AppearanceSettingsPage />);

        const system = screen.getByRole('radio', { name: /Системная/ }) as HTMLInputElement;
        const light = screen.getByRole('radio', { name: /Светлая/ }) as HTMLInputElement;
        const dark = screen.getByRole('radio', { name: /Тёмная/ }) as HTMLInputElement;
        expect(system.checked).toBe(true);

        fireEvent.click(light);
        expect(light.checked).toBe(true);
        expect(getAppearanceSettings()).toEqual({ theme: 'light' });

        fireEvent.click(dark);
        expect(dark.checked).toBe(true);
        expect(getAppearanceSettings()).toEqual({ theme: 'dark' });

        fireEvent.click(system);
        expect(system.checked).toBe(true);
        expect(getAppearanceSettings()).toEqual({ theme: 'system' });
    });
});
