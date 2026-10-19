import type { MatrixSession } from './session';
import { clearSession } from './session';
import type { MatrixClient } from 'matrix-js-sdk';

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
    clearSession(): void;
}

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

    getState(): LifecycleSnapshot {
        return this.snapshot;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

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
    // M_UNKNOWN_TOKEN при sync/API-запросе: сессия отозвана сервером —
    // локально чистимся и переходим в 'session expired'.
    // =====================================================================
    handleApiError(error: unknown): Promise<void> {
        const errcode = this.extractErrcode(error);
        if (errcode !== 'M_UNKNOWN_TOKEN') {
            return Promise.resolve();
        }
        return this.enqueue(async () => {
            this.deps.clearSession();
            this.session = null;
            this.setState({ state: 'session expired', error: null });
        });
    }

    private extractErrcode(error: unknown): string | null {
        if (
            error &&
            typeof error === 'object' &&
            'errcode' in error &&
            typeof (error as { errcode: unknown }).errcode === 'string'
        ) {
            return (error as { errcode: string }).errcode;
        }
        return null;
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
