import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createOtkConflictDetector,
    OTK_CONFLICT_THRESHOLD,
} from './crypto-conflict';

describe('createOtkConflictDetector', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('поднимает флаг после порога повторов конфликта OTK', () => {
        const detector = createOtkConflictDetector();
        const listener = vi.fn();
        detector.subscribe(listener);

        const message =
            'Failed to process outgoing request 0: M_UNKNOWN: MatrixError: [400] ' +
            'One time key signed_curve25519:AAAAAAAAAA8 already exists.';

        for (let i = 0; i < OTK_CONFLICT_THRESHOLD - 1; i++) {
            detector.error(message);
        }
        expect(detector.getState().conflict).toBe(false);
        expect(listener).not.toHaveBeenCalled();

        detector.error(message);
        expect(detector.getState().conflict).toBe(true);
        expect(listener).toHaveBeenCalled();
    });

    it('не реагирует на другие ошибки', () => {
        const detector = createOtkConflictDetector();
        for (let i = 0; i < OTK_CONFLICT_THRESHOLD + 2; i++) {
            detector.error('Failed to process outgoing request 0: network timeout');
            detector.error('Some unrelated error');
        }
        expect(detector.getState().conflict).toBe(false);
    });

    it('не реагирует, если нет маркера outgoing request', () => {
        const detector = createOtkConflictDetector();
        for (let i = 0; i < OTK_CONFLICT_THRESHOLD + 1; i++) {
            detector.error('One time key signed_curve25519:AAAAAAAAAA8 already exists.');
        }
        expect(detector.getState().conflict).toBe(false);
    });

    it('не срабатывает повторно после установки флага', () => {
        const detector = createOtkConflictDetector();
        const listener = vi.fn();
        detector.subscribe(listener);
        const message =
            'Failed to process outgoing request 0: One time key signed_curve25519:X already exists.';
        for (let i = 0; i < OTK_CONFLICT_THRESHOLD + 5; i++) {
            detector.error(message);
        }
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
