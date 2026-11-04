// Детектор конфликта one-time keys: когда крипто-база была стёрта, а сессия
// (deviceId) сохранилась, сервер отклоняет /keys/upload с
// «One time key … already exists» и SDK ретраит это бесконечно (см.
// OutgoingRequestsManager — ошибки только логируются через logger.error).
// Единственное лечение — новый device (перелогин); здесь мы только замечаем
// паттерн и сообщаем UI. Сам SDK и сетевой слой не трогаем.

export const OTK_CONFLICT_THRESHOLD = 3;

const OTK_CONFLICT_PATTERN = /Failed to process outgoing request.*One time key .*already exists/s;

export interface OtkConflictState {
    conflict: boolean;
}

export interface OtkConflictDetector {
    /** Подать строку из logger.error SDK. */
    error: (...args: unknown[]) => void;
    getState: () => OtkConflictState;
    subscribe: (listener: () => void) => () => void;
}

export const createOtkConflictDetector = (): OtkConflictDetector => {
    let strikes = 0;
    let conflict = false;
    const listeners = new Set<() => void>();

    return {
        error: (...args: unknown[]) => {
            if (conflict) return;
            const text = args
                .map((a) => (a instanceof Error ? a.message : String(a)))
                .join(' ');
            if (!OTK_CONFLICT_PATTERN.test(text)) return;
            strikes += 1;
            if (strikes >= OTK_CONFLICT_THRESHOLD) {
                conflict = true;
                listeners.forEach((l) => l());
            }
        },
        getState: () => ({ conflict }),
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
};

// Singleton: клиент создаётся один раз на сессию, UI подписывается через
// useSyncExternalStore. Флаг живёт до перезагрузки/перелогина — это осознанно:
// пока deviceId тот же, конфликт не рассосётся сам.
export const otkConflict = createOtkConflictDetector();
