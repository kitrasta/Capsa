import { describe, expect, it } from 'vitest';
import {
    isUnknownTokenError,
    isForbiddenError,
    isNotFoundError,
    matrixErrorMessage,
} from '../errors';

// ---------------------------------------------------------------------------
// Единый классификатор Matrix-ошибок: весь код (lifecycle, UI) опирается
// только на него — разбор errcode не должен расползаться по компонентам.
// ---------------------------------------------------------------------------

describe('isUnknownTokenError', () => {
    it('распознаёт M_UNKNOWN_TOKEN (плоский объект)', () => {
        expect(isUnknownTokenError({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid access token' })).toBe(true);
    });

    it('распознаёт M_UNKNOWN_TOKEN у экземпляра Error (MatrixError из SDK)', () => {
        // MatrixError из matrix-js-sdk — это Error со своим полем errcode
        const sdkError = Object.assign(new Error('Unrecognised access token'), {
            errcode: 'M_UNKNOWN_TOKEN',
        });
        expect(isUnknownTokenError(sdkError)).toBe(true);
    });

    it('не путает с другими errcode', () => {
        expect(isUnknownTokenError({ errcode: 'M_FORBIDDEN' })).toBe(false);
        expect(isUnknownTokenError({ errcode: 'M_NOT_FOUND' })).toBe(false);
        expect(isUnknownTokenError({ errcode: 'M_LIMIT_EXCEEDED' })).toBe(false);
    });

    it('не считает известными ошибки без errcode (сеть, CORS, разрыв)', () => {
        expect(isUnknownTokenError(new Error('fetch failed'))).toBe(false);
        expect(isUnknownTokenError({ error: 'boom' })).toBe(false);
        expect(isUnknownTokenError(null)).toBe(false);
        expect(isUnknownTokenError(undefined)).toBe(false);
        expect(isUnknownTokenError('M_UNKNOWN_TOKEN')).toBe(false);
    });

    it('не считает errcode нестрочного типа', () => {
        expect(isUnknownTokenError({ errcode: 42 })).toBe(false);
    });
});

describe('isForbiddenError / isNotFoundError', () => {
    it('распознают свои коды', () => {
        expect(isForbiddenError({ errcode: 'M_FORBIDDEN' })).toBe(true);
        expect(isNotFoundError({ errcode: 'M_NOT_FOUND' })).toBe(true);
    });

    it('не пересекаются с M_UNKNOWN_TOKEN и не-matrix ошибками', () => {
        expect(isForbiddenError({ errcode: 'M_UNKNOWN_TOKEN' })).toBe(false);
        expect(isNotFoundError({ errcode: 'M_UNKNOWN_TOKEN' })).toBe(false);
        expect(isForbiddenError(new Error('forbidden'))).toBe(false);
        expect(isNotFoundError(null)).toBe(false);
    });
});

describe('matrixErrorMessage', () => {
    it('берёт текст из матричного error-поля', () => {
        expect(matrixErrorMessage({ errcode: 'M_UNKNOWN_TOKEN', error: 'Invalid access token' }))
            .toBe('Invalid access token');
    });

    it('падает на message у обычной Error', () => {
        expect(matrixErrorMessage(new Error('fetch failed'))).toBe('fetch failed');
    });

    it('не показывает чувствительные данные для неизвестных ошибок', () => {
        expect(matrixErrorMessage(null)).toBe('Неизвестная ошибка');
        expect(matrixErrorMessage({ errcode: 'M_UNKNOWN_TOKEN' })).toBe('Неизвестная ошибка');
    });
});
