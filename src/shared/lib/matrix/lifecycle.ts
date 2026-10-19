import type { MatrixSession } from './session';
import { isUnknownTokenError } from './errors';

// ============================================================================
// Где появляется состояние lifecycle Matrix-клиента
// ============================================================================
//
// Единственный источник правды — это менеджер. UI (MainLayout, SettingsMenu)
// не держат собственных флагов готовности/ошибки, а только подписываются на
// менеджер: поэтому ошибки не могут превратиться в бесконечный loader и не
// исчезают в тихом console.error — они всегда видны как snapshot.
//
// Состояния:
//
//   'idle'             клиент ещё не запускался (менеджер только создан)
//   'client starting'  init/start в процессе — показываем лоадер
//   'client ready'     клиент работает — показываем интерфейс
//   'client stopped'   logout завершён, клиент остановлен — сессии нет
//   'session expired'  сервер отозвал сессию (M_UNKNOWN_TOKEN при sync/API)
//   'crypto error'     initRustCrypto не поднялся — нужна перезагрузка страницы
//   'error'            прочая ошибка запуска (сеть, база данных) — нужна перезагрузка
//
// Ошибки в snapshot передаются через поле `error`, так что UI всегда знает
// причину вместо того чтобы застрять в лоадере или игнорировать ошибку.
// ============================================================================

export type LifecycleState =
    | 'idle'
    | 'client starting'
    | 'client ready'
    | 'client stopped'
    | 'session expired'
    | 'crypto error'
    | 'error';

export interface LifecycleSnapshot {
    state: LifecycleState;
    error: string | null;
}

export interface LifecycleDeps {
    initClient(session: MatrixSession): Promise<void>;
    startClient(): Promise<void>;
    logout(): Promise<void>;
    // локальная остановка клиента без серверного /logout — для случая,
    // когда токен уже мёртв и звонить на сервер бессмысленно
    stopClient(): void | Promise<void>;
    clearSession(): void;
}

/** Единое понятное сообщение для пользователя при отозванной сессии. */
export const SESSION_EXPIRED_MESSAGE = 'Сессия истекла, войдите снова';

const initialState: LifecycleSnapshot = { state: 'idle', error: null };

const isSameSession = (a: MatrixSession | null, b: MatrixSession): boolean =>
    a !== null &&
    a.accessToken === b.accessToken &&
    a.userId === b.userId &&
    a.deviceId === b.deviceId;

const messageOf = (error: unknown): string =>
    error instanceof Error && error.message ? error.message : 'Неизвестная ошибка';

export class MatrixLifecycleManager {
    private readonly deps: LifecycleDeps;
    private snapshot: LifecycleSnapshot = initialState;
    private session: MatrixSession | null = null;
    private listeners = new Set<() => void>();
    // Очередь сериализует операции: init/start/logout никогда не пересекаются.
    // logout, пришедший во время запуска, дожидается его завершения и выполняется
    // сразу после — никаких гонок между logout и start.
    private queue: Promise<unknown> = Promise.resolve();

    constructor(deps: LifecycleDeps) {
        this.deps = deps;
    }

    // Стрелочные поля: ссылки можно передавать в useSyncExternalStore без bind
    // (this не теряется) — иначе this оказывается undefined и snapshot не читается
    getState = (): LifecycleSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    private setState(next: LifecycleSnapshot): void {
        this.snapshot = next;
        this.listeners.forEach((l) => l());
    }

    // Операции выполняются строго последовательно.
    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const result = this.queue.then(task, task);
        this.queue = result.then(() => undefined, () => undefined);
        return result;
    }

    // =====================================================================
    // Старт: idempotent для той же сессии; для другого пользователя —
    // старый клиент останавливается и создаётся новый.
    // =====================================================================
    start(session: MatrixSession): Promise<void> {
        return this.enqueue(async () => {
            // повторный init с той же сессией — без лишних пересозданий
            if (this.snapshot.state === 'client ready' && isSameSession(this.session, session)) {
                return;
            }

            // если уже есть сессия другого пользователя — старый клиент стопим
            if (this.session !== null) {
                this.deps.clearSession();
            }

            this.setState({ state: 'client starting', error: null });
            try {
                await this.deps.initClient(session);
                await this.deps.startClient();
                this.session = session;
                this.setState({ state: 'client ready', error: null });
            } catch (error) {
                this.session = null;
                this.deps.clearSession();
                // токен отозван ещё на старте — та же реакция, что и при sync
                if (isUnknownTokenError(error)) {
                    try {
                        await this.deps.stopClient();
                    } finally {
                        // state ставится всегда — юзер не застревает в лоадере
                        this.setState({ state: 'session expired', error: SESSION_EXPIRED_MESSAGE });
                    }
                    return;
                }
                this.setState({
                    state: error instanceof CryptoInitError ? 'crypto error' : 'error',
                    error: messageOf(error),
                });
            }
        });
    }

    // =====================================================================
    // Logout: гарантированно останавливает клиент и снимает сессию, даже
    // если серверный logout упал. Ошибка сервера пробрасывается вызывающему,
    // но local state всегда становится 'client stopped'.
    // =====================================================================
    logout(): Promise<void> {
        return this.enqueue(async () => {
            let failure: unknown = null;
            try {
                await this.deps.logout();
            } catch (error) {
                failure = error;
            } finally {
                // локальная сессия снимается всегда — даже при ошибке сети
                this.deps.clearSession();
                this.session = null;
                this.setState({ state: 'client stopped', error: null });
            }
            if (failure !== null) {
                throw failure; // ошибка сообщается вызывающему коду
            }
        });
    }

    // =====================================================================
    // M_UNKNOWN_TOKEN при sync/API-запросе: сессия отозвана сервером.
    // Единая реакция (не по компонентам):
    //   1. остановить клиент;
    //   2. очистить session keys;
    //   3. очистить локальный lifecycle state → 'session expired';
    //   4. UI (AuthGuard) уводит на Login и показывает понятное сообщение.
    // Прочие ошибки (M_FORBIDDEN, M_NOT_FOUND, сеть) здесь не трогаем —
    // их классифицирует errors.ts и решает вызывающий код.
    // =====================================================================
    handleApiError(error: unknown): Promise<void> {
        if (!isUnknownTokenError(error)) {
            return Promise.resolve();
        }
        return this.enqueue(async () => {
            try {
                // остановить клиент (токен мёртв, /logout на сервер не звоним)
                await this.deps.stopClient();
            } finally {
                // очистить session keys — всегда, даже если остановка упала
                this.deps.clearSession();
                this.session = null;
                // очистить локальный lifecycle state → UI сам уйдёт на Login
                this.setState({ state: 'session expired', error: SESSION_EXPIRED_MESSAGE });
            }
        });
    }
}

// ---------------------------------------------------------------------------
// initRustCrypto упал — отдельно от прочих ошибок старта: реакция
// (перезагрузка страницы / смена аккаунта) должна быть другой.
// ---------------------------------------------------------------------------
export class CryptoInitError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'CryptoInitError';
    }
}

// ---------------------------------------------------------------------------
// Фабрика: связывает менеджер с реализацией из client.ts. lifecycle.ts остаётся
// чистым (зависит только от session.ts и матричных типов), а конкретная
// привязка к matrix-js-sdk происходит в client.ts, где уже собраны
// initClient / startClient / logout.
// ---------------------------------------------------------------------------
export const createLifecycleManager = (deps: LifecycleDeps) =>
    new MatrixLifecycleManager(deps);
