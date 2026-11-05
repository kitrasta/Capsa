// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getRememberedDeviceId,
    rememberDeviceIdentity,
} from '../device-identity';
import type { LoginTarget } from '../homeserver';

const target = (identifier: string, serverName = 'example.org'): LoginTarget => ({
    identifier,
    serverName,
    homeserverUrl: `https://${serverName}`,
});

describe('device identity', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('возвращает device ID только для того же нормализованного Matrix ID', () => {
        rememberDeviceIdentity('@Alice:Example.ORG', 'DEVICE1');

        expect(getRememberedDeviceId(target('@alice:example.org'))).toBe('DEVICE1');
        expect(getRememberedDeviceId(target('alice'))).toBe('DEVICE1');
        expect(getRememberedDeviceId(target('@bob:example.org'))).toBeNull();
        expect(getRememberedDeviceId(target('alice', 'other.org'))).toBeNull();
    });

    it('не ломает вход при недоступном хранилище', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });

        expect(() => rememberDeviceIdentity('@alice:example.org', 'DEVICE1')).not.toThrow();
        expect(getRememberedDeviceId(target('alice'))).toBeNull();
    });
});
