import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoDiscovery, AutoDiscoveryAction } from 'matrix-js-sdk';

vi.mock('matrix-js-sdk', () => ({
    AutoDiscoveryAction: {
        SUCCESS: 'SUCCESS',
        IGNORE: 'IGNORE',
        PROMPT: 'PROMPT',
        FAIL_PROMPT: 'FAIL_PROMPT',
        FAIL_ERROR: 'FAIL_ERROR',
    },
    AutoDiscovery: { findClientConfig: vi.fn() },
}));

const findClientConfig = vi.mocked(AutoDiscovery.findClientConfig);

beforeEach(() => {
    vi.resetModules();
    findClientConfig.mockReset();
    vi.stubEnv('VITE_MATRIX_HOMESERVER_URL', 'https://matrix.capsachat.org');
    vi.stubEnv('VITE_MATRIX_SERVER_NAME', 'capsachat.org');
});

afterEach(() => {
    vi.unstubAllEnvs();
});

const loadHomeserver = () => import('../homeserver');

const discoveryResult = (state: AutoDiscoveryAction, baseUrl?: string) => ({
    'm.homeserver': {
        state,
        ...(baseUrl === undefined ? {} : { base_url: baseUrl }),
    },
    'm.identity_server': { state: AutoDiscoveryAction.IGNORE },
});

describe('resolveLoginTarget', () => {
    it('использует Capsa для короткого логина без discovery', async () => {
        const { resolveLoginTarget } = await loadHomeserver();

        await expect(resolveLoginTarget('  alice  ')).resolves.toEqual({
            identifier: 'alice',
            homeserverUrl: 'https://matrix.capsachat.org',
            serverName: 'capsachat.org',
        });
        expect(findClientConfig).not.toHaveBeenCalled();
    });

    it('разрешает полный Matrix ID через discovery', async () => {
        findClientConfig.mockResolvedValue(discoveryResult(
            AutoDiscoveryAction.SUCCESS,
            'https://matrix-client.matrix.org/',
        ) as never);
        const { resolveLoginTarget } = await loadHomeserver();

        await expect(resolveLoginTarget('@alice:matrix.org')).resolves.toEqual({
            identifier: '@alice:matrix.org',
            homeserverUrl: 'https://matrix-client.matrix.org',
            serverName: 'matrix.org',
        });
        expect(findClientConfig).toHaveBeenCalledWith('matrix.org');
    });

    it.each(['', '   ', '@alice', '@alice:', '@:matrix.org', 'alice smith'])(
        'отклоняет malformed login %j до сетевого запроса',
        async (input) => {
            const { resolveLoginTarget } = await loadHomeserver();

            await expect(resolveLoginTarget(input)).rejects.toThrow('Введите логин');
            expect(findClientConfig).not.toHaveBeenCalled();
        },
    );

    it.each([
        AutoDiscoveryAction.PROMPT,
        AutoDiscoveryAction.FAIL_PROMPT,
        AutoDiscoveryAction.FAIL_ERROR,
    ])('отклоняет discovery со статусом %s без fallback на Capsa', async (state) => {
        findClientConfig.mockResolvedValue(discoveryResult(
            state,
            'https://matrix-client.matrix.org',
        ) as never);
        const { resolveLoginTarget, HomeserverDiscoveryError } = await loadHomeserver();

        await expect(resolveLoginTarget('@alice:matrix.org')).rejects.toBeInstanceOf(
            HomeserverDiscoveryError,
        );
    });

    it('отклоняет SUCCESS без валидного base_url', async () => {
        findClientConfig.mockResolvedValue(discoveryResult(
            AutoDiscoveryAction.SUCCESS,
            'not a URL',
        ) as never);
        const { resolveLoginTarget, HomeserverDiscoveryError } = await loadHomeserver();

        await expect(resolveLoginTarget('@alice:matrix.org')).rejects.toBeInstanceOf(
            HomeserverDiscoveryError,
        );
    });
});
