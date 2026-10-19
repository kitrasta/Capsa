// Lifecycle Matrix-клиента: связка менеджера (lifecycle.ts) с реализацией
// из client.ts. Единственная точка реакции на ошибки sync/API и единственный
// владелец сквозного сценария «запуск / остановка / logout» — UI работает
// только с matrixLifecycle и не дублирует эту логику по компонентам.
import { ClientEvent } from 'matrix-js-sdk';
import { createLifecycleManager } from './lifecycle';
import { initClient, startClient, stopClient, logout } from './client';
import { clearSession } from './session';

// M_UNKNOWN_TOKEN при sync/API-запросе разбирает lifecycle-менеджер
// (остановка клиента, очистка сессии, UI → Login с понятным сообщением)
function notifyApiError(error: unknown): void {
    matrixLifecycle.handleApiError(error).catch((cleanupError) => {
        // сбой локальной чистки не должен превращаться в unhandled rejection
        console.error('Failed to handle Matrix API error', cleanupError);
    });
}

export const matrixLifecycle = createLifecycleManager({
    initClient: async (session) => {
        const matrixClient = await initClient(session);
        // отслеживаем M_UNKNOWN_TOKEN на sync/API-запросах — сессия истекла
        matrixClient.on(ClientEvent.Sync, (_state, _prev, data) => {
            notifyApiError(data?.error);
        });
    },
    startClient,
    stopClient,
    logout,
    clearSession,
});
