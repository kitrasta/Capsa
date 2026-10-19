// Публичный API matrix-слоя. UI импортирует только отсюда — внутренняя
// раскладка модулей (client / client-manager / crypto / storage / api/*)
// может меняться без правок компонентов.
//
// Экспортируем только то, чем реально пользуется UI. Всё остальное
// (классификатор ошибок, типы, константы) остаётся внутренним и попадает
// сюда, когда появится реальный потребитель.

// ---------------------------------------------------------------------------
// Клиент: создание/получение/запуск/выход.
// Внимание: для UI предпочтительнее matrixLifecycle (ниже) — он держит
// lifecycle state; прямые initClient/startClient/logout его не обновляют.
// ---------------------------------------------------------------------------
export {
    initClient,
    startClient,
    getClient,
    logout,
} from './client';

// ---------------------------------------------------------------------------
// Сессия в localStorage (сохранение/чтение/очистка)
// ---------------------------------------------------------------------------
export {
    getSession,
    saveSession,
    clearSession,
} from './session';

// lifecycle клиента: единая точка запуска/остановки/logout + состояние для UI
export { matrixLifecycle } from './client-manager';

// вход по логину/паролю
export { loginUser, validateLoginResponse } from './client';

// API-вызовы
export {
    searchPublicRooms,
    joinRoom,
    createDirectChat,
    createGroup,
    createChannel,
} from './api/rooms';
export { searchUsers, type UserSearchResult } from './api/users';
export { createSpace, addRoomToSpace, getRoomSummary } from './api/spaces';
export { setDisplayName, setAvatar } from './api/profile';

// разовая очистка крипто-базы старого формата при старте
export { cleanupLegacyCryptoStore } from './crypto';
