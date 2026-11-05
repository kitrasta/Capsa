// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

type AppearanceModule = typeof import('./appearance');
let appearance: AppearanceModule;

describe('appearance settings', () => {
    beforeEach(async () => {
        localStorage.clear();
        vi.resetModules();
        appearance = await import('./appearance');
    });

    it('использует системную тему по умолчанию и при повреждённом JSON', async () => {
        expect(appearance.getAppearanceSettings()).toEqual({ theme: 'system' });

        localStorage.setItem('capsa.appearance', '{broken');
        vi.resetModules();
        appearance = await import('./appearance');
        expect(appearance.getAppearanceSettings()).toEqual({ theme: 'system' });
    });

    it('отбрасывает неизвестную тему', async () => {
        localStorage.setItem('capsa.appearance', JSON.stringify({ theme: 'blue' }));
        vi.resetModules();
        appearance = await import('./appearance');

        expect(appearance.getAppearanceSettings()).toEqual({ theme: 'system' });
    });

    it('сохраняет выбор, уведомляет подписчика и держит стабильный snapshot', () => {
        const listener = vi.fn();
        const unsubscribe = appearance.subscribeAppearance(listener);
        const before = appearance.getAppearanceSettings();

        appearance.setAppearanceSettings({ theme: 'light' });

        expect(appearance.getAppearanceSettings()).toEqual({ theme: 'light' });
        expect(appearance.getAppearanceSettings()).toBe(appearance.getAppearanceSettings());
        expect(before).toEqual({ theme: 'system' });
        expect(JSON.parse(localStorage.getItem('capsa.appearance')!)).toEqual({ theme: 'light' });
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        appearance.setAppearanceSettings({ theme: 'dark' });
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('применяет выбранную тему к корню документа', () => {
        const root = document.createElement('html');

        appearance.applyAppearanceSettings({ theme: 'dark' }, root);

        expect(root.dataset.theme).toBe('dark');
    });
});
