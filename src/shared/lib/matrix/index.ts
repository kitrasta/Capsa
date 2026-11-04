// Публичный API matrix-слоя. UI импортирует только отсюда — внутренняя
// раскладка модулей (client / client-manager / crypto / storage / api/*)
// может меняться без правок компонентов.
//
// Экспортируем только то, чем реально пользуется UI. Всё остальное
// (классификатор ошибок, типы, константы) остаётся внутренним и попадает
// сюда, когда появится реальный потребитель.

// ---------------------------------------------------------------------------
// Клиент: получение singleton'а для прямых API-вызовов.
// Операции жизненного цикла (init/start/logout) наружу НЕ экспортируются:
// UI работает только через matrixLifecycle — иначе состояние разъедётся.
// ---------------------------------------------------------------------------
export { getClient } from './client';

// детектор конфликта one-time keys (400 «already exists» после сброса
// крипто-базы с сохранённым deviceId) — для баннера в MainLayout
export { otkConflict } from './crypto-conflict';

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

// вход по логину/паролю и выбор homeserver'а
export { loginUser, validateLoginResponse } from './client';
export {
    resolveLoginTarget,
    getCapsaHomeserver,
    HomeserverDiscoveryError,
    type HomeserverConnection,
    type LoginTarget,
} from './homeserver';

// регистрация на homeserver'е Capsa с обязательным подтверждением email
export {
    startEmailRegistration,
    registrationErrorMessage,
    type RegistrationInput,
    type RegistrationEvents,
    type RegistrationSession,
} from './registration';

// API-вызовы
export {
    searchPublicRooms,
    joinRoom,
    createDirectChat,
    createGroup,
    createChannel,
} from './api/rooms';

// Ответы, редактирование, реакции
export {
    sendReplyMessage,
    editMessage,
    toggleReaction,
    buildEditContent,
    buildReplyContent,
    parseReplyBody,
    trimReplyFromBody,
    trimReplyFromFormattedBody,
    type ReplyTarget,
    getEventReactions,
    getReactionContent,
} from './api/messages';
export { searchUsers, type UserSearchResult } from './api/users';
export {
    createSpace,
    addRoomToSpace,
    getSpaceChildSummaries,
    type ChildSummary,
} from './api/spaces';
export { setDisplayName, setAvatar } from './api/profile';

// разовая очистка крипто-базы старого формата при старте
export { cleanupLegacyCryptoStore } from './crypto';

// Одноразовое восстановление E2EE на новом устройстве
export {
    getEncryptionRecoveryStatus,
    recoverEncryptionWithKey,
    restoreKeysAfterVerification,
    requestOwnDeviceVerification,
    type EncryptionRecoveryStatus,
} from './encryption-recovery';

// Классификатор ошибок (errors.ts): наружу — то, чем UI реально пользуется
// для различения ошибок входа (конфигурация ≠ неверный пароль ≠ сеть).
export { isForbiddenError, matrixErrorMessage } from './errors';

// Типы ошибок слоя: ConfigError — конфигурация не задана
export { ConfigError } from './error-types';
