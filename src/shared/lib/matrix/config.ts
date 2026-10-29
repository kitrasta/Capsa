// Конфигурация Matrix-слоя: адрес homeserver'а и его server_name.
// Живёт отдельно от client.ts — не зависит от matrix-js-sdk и легко тестируется.
//
// Значения берутся из окружения (см. .env.example). Ничего не хардкодим:
// сервер у нас свой, адрес должен переезжать без переписывания кода.
import { ConfigError } from './error-types';

const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

export const MATRIX_HOMESERVER_URL = trimTrailingSlashes(
    (import.meta.env.VITE_MATRIX_HOMESERVER_URL ?? '').trim(),
);

// server_name для via (spaces) и федерации. Если не задан явно —
// хост из адреса API (подходит, когда делегирования нет и
// server_name совпадает с доменом API).
export const MATRIX_SERVER_NAME =
    (import.meta.env.VITE_MATRIX_SERVER_NAME ?? '').trim() ||
    (MATRIX_HOMESERVER_URL ? new URL(MATRIX_HOMESERVER_URL).hostname : '');

// Явная ошибка вместо молчаливых запросов на пустой адрес:
// без .env приложение не знает, куда ходить. ConfigError — чтобы UI
// показал это как ошибку настройки, а не «неверный пароль».
export const requireHomeserverUrl = (): string => {
    if (!MATRIX_HOMESERVER_URL) {
        throw new ConfigError(
            'Не задан VITE_MATRIX_HOMESERVER_URL: скопируй .env.example в .env и укажи адрес своего homeserver',
        );
    }
    return MATRIX_HOMESERVER_URL;
};
