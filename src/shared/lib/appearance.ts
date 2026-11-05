export type ThemePreference = 'system' | 'dark' | 'light';

export interface AppearanceSettings {
    theme: ThemePreference;
}

const STORAGE_KEY = 'capsa.appearance';
const DEFAULT_SETTINGS: AppearanceSettings = { theme: 'system' };
const themes: readonly ThemePreference[] = ['system', 'dark', 'light'];
const listeners = new Set<() => void>();
let snapshot: AppearanceSettings | null = null;

const readSettings = (): AppearanceSettings => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_SETTINGS;
        const value = JSON.parse(stored) as { theme?: unknown };
        return themes.includes(value.theme as ThemePreference)
            ? { theme: value.theme as ThemePreference }
            : DEFAULT_SETTINGS;
    } catch {
        return DEFAULT_SETTINGS;
    }
};

export const getAppearanceSettings = (): AppearanceSettings => {
    snapshot ??= readSettings();
    return snapshot;
};

export const setAppearanceSettings = (partial: Partial<AppearanceSettings>): void => {
    snapshot = { ...getAppearanceSettings(), ...partial };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
        // Выбор остаётся активным в этой вкладке даже без постоянного хранилища.
    }
    listeners.forEach((listener) => listener());
};

export const subscribeAppearance = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const applyAppearanceSettings = (
    settings: AppearanceSettings,
    root: HTMLElement,
): void => {
    root.dataset.theme = settings.theme;
};
