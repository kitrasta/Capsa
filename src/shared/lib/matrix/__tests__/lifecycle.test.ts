import { describe, expect, it, vi, type Mock } from 'vitest';
import {
    MatrixLifecycleManager,
    SESSION_EXPIRED_MESSAGE,
} from '../lifecycle';
import type { MatrixSession } from '../session';

// ---------------------------------------------------------------------------
// Обработка M_UNKNOWN_TOKEN едина для всех мест вызова: остановить клиент,
// очистить session keys, очистить локальный lifecycle state. UI реагирует
// на snapshot ('session expired' + сообщение), а не разбирает ошибку сам.
// ---------------------------------------------------------------------------

const SESSION: MatrixSession = {
    accessToken: 'test-access-token',
    userId: '@alice:example.org',
    deviceId: 'DEVICE1',
};

const UNKNOWN_TOKEN = { errcode: 'M_UNKNOWN_TOKEN', error: 'Unrecognised access token' };

type DepMocks = {
    initClient: Mock;
    startClient: Mock;
    logout: Mock;
    stopClient: Mock;
    clearSession: Mock;
};

function makeDeps(overrides: Partial<DepMocks> = {}): DepMocks {
    return {
        initClient: vi.fn(async () => {}),
        startClient: vi.fn(async () => {}),
        logout: vi.fn(async () => {}),
        stopClient: vi.fn(async () => {}),
        clearSession: vi.fn(),
        ...overrides,
    };
}

describe('handleApiError: M_UNKNOWN_TOKEN', () => {
    it('останавливает клиент, чистит session keys и переводит state в session expired', async () => {
        const deps = makeDeps();
        const manager = new MatrixLifecycleManager(deps);
        await manager.start(SESSION);

        await manager.handleApiError(UNKNOWN_TOKEN);

        expect(deps.stopClient).toHaveBeenCalledTimes(1);
        expect(deps.clearSession).toHaveBeenCalledTimes(1);
        expect(manager.getState()).toEqual({
            state: 'session expired',
            error: SESSION_EXPIRED_MESSAGE,
        });
    });

    it('сообщает понятный текст: «Сессия истекла, войдите снова»', async () => {
        const manager = new MatrixLifecycleManager(makeDeps());
        await manager.handleApiError(UNKNOWN_TOKEN);
        expect(manager.getState().error).toBe('Сессия истекла, войдите снова');
    });

    it('уведомляет подписчиков (UI перерисовывается и уходит на Login)', async () => {
        const manager = new MatrixLifecycleManager(makeDeps());
        const listener = vi.fn();
        manager.subscribe(listener);

        await manager.handleApiError(UNKNOWN_TOKEN);

        expect(listener).toHaveBeenCalled();
        expect(manager.getState().state).toBe('session expired');
    });

    it('повторный M_UNKNOWN_TOKEN не ломает состояние', async () => {
        const deps = makeDeps();
        const manager = new MatrixLifecycleManager(deps);
        await manager.handleApiError(UNKNOWN_TOKEN);
        await manager.handleApiError(UNKNOWN_TOKEN);
        expect(manager.getState().state).toBe('session expired');
    });

    it('ошибка stopClient не оставляет зависшее состояние: чистка локальная всегда', async () => {
        const deps = makeDeps({
            stopClient: vi.fn(async () => {
                throw new Error('stop failed');
            }),
        });
        const manager = new MatrixLifecycleManager(deps);

        // ошибка остановки пробрасывается вызывающему…
        await expect(manager.handleApiError(UNKNOWN_TOKEN)).rejects.toThrow('stop failed');
        // …но session keys сняты и state очищен — юзер всё равно на Login
        expect(deps.clearSession).toHaveBeenCalledTimes(1);
        expect(manager.getState()).toEqual({
            state: 'session expired',
            error: SESSION_EXPIRED_MESSAGE,
        });
    });
});

describe('handleApiError: прочие ошибки', () => {
    it.each([
        ['M_FORBIDDEN', { errcode: 'M_FORBIDDEN', error: 'Forbidden' }],
        ['M_NOT_FOUND', { errcode: 'M_NOT_FOUND', error: 'Not found' }],
        ['сеть без errcode', new Error('fetch failed')],
        ['null', null],
    ])('%s не трогает клиент и состояние', async (_name, error) => {
        const deps = makeDeps();
        const manager = new MatrixLifecycleManager(deps);
        await manager.start(SESSION);

        await manager.handleApiError(error);

        expect(deps.stopClient).not.toHaveBeenCalled();
        expect(deps.clearSession).not.toHaveBeenCalled();
        expect(manager.getState().state).toBe('client ready');
    });
});

describe('start: M_UNKNOWN_TOKEN на старте', () => {
    it('классифицируется тем же классификатором → session expired', async () => {
        const deps = makeDeps({
            initClient: vi.fn(async () => {
                throw UNKNOWN_TOKEN;
            }),
        });
        const manager = new MatrixLifecycleManager(deps);

        await manager.start(SESSION);

        expect(deps.clearSession).toHaveBeenCalledTimes(1);
        expect(deps.stopClient).toHaveBeenCalledTimes(1);
        expect(manager.getState()).toEqual({
            state: 'session expired',
            error: SESSION_EXPIRED_MESSAGE,
        });
    });
});
