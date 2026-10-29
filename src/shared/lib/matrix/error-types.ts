// Типы ошибок matrix-слоя. Живут отдельно от lifecycle.ts и errors.ts:
// их бросают нижние модули (crypto.ts), а реагирует на них state-machine
// (lifecycle.ts) — так направление зависимостей сохраняется без циклов.
//
// initRustCrypto не поднялся — отдельно от прочих ошибок старта: реакция
// (перезагрузка страницы / смена аккаунта) должна быть другой.
export class CryptoInitError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'CryptoInitError';
    }
}

// Конфигурация приложения не задана (нет VITE_MATRIX_HOMESERVER_URL).
// Отдельный класс: UI показывает это сообщение как есть — это ошибка
// настройки, а не неверный логин/пароль или сеть.
export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}
