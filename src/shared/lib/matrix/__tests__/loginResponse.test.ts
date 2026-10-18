import { describe, expect, it } from 'vitest';
import { validateLoginResponse } from '../client';

describe('validateLoginResponse', () => {
    const valid = {
        access_token: 'test-access-token',
        user_id: '@alice:example.org',
        device_id: 'DEVICE1',
    } as const;

    it('валидный ответ проходит', () => {
        expect(() => validateLoginResponse(valid)).not.toThrow();
    });

    it('отсутствующий access_token отбрасывает', () => {
        expect(() => validateLoginResponse({ ...valid, access_token: undefined as never }))
            .toThrow('Неполный ответ сервера: отсутствует access_token');
    });

    it('пустой access_token отбрасывает', () => {
        expect(() => validateLoginResponse({ ...valid, access_token: '' }))
            .toThrow('Неполный ответ сервера: отсутствует access_token');
    });

    it('пробелы в access_token отбрасывают', () => {
        expect(() => validateLoginResponse({ ...valid, access_token: '   ' }))
            .toThrow('Неполный ответ сервера: отсутствует access_token');
    });

    it('отсутствующий device_id отбрасывает', () => {
        expect(() => validateLoginResponse({ ...valid, device_id: undefined as never }))
            .toThrow('Неполный ответ сервера: отсутствует device_id');
    });

    it('пробелы в device_id отбрасывают', () => {
        expect(() => validateLoginResponse({ ...valid, device_id: '   ' }))
            .toThrow('Неполный ответ сервера: отсутствует device_id');
    });

    it('неверный Matrix-формат userId отбрасывает (invalid-user)', () => {
        expect(() => validateLoginResponse({ ...valid, user_id: 'invalid-user' }))
            .toThrow('Неполный ответ сервера: отсутствует user_id или неверный Matrix-идентификатор');
    });

    it('user id без домена отбрасывает (@localpart без :)', () => {
        expect(() => validateLoginResponse({ ...valid, user_id: '@alice' }))
            .toThrow('Неполный ответ сервера: отсутствует user_id или неверный Matrix-идентификатор');
    });

    it('user id без localpart отбрасывает (:domain без @)', () => {
        expect(() => validateLoginResponse({ ...valid, user_id: ':domain.org' }))
            .toThrow('Неполный ответ сервера: отсутствует user_id или неверный Matrix-идентификатор');
    });

    it('валидный userId с сложным localpart и доменом проходит', () => {
        const r = { ...valid, user_id: '@user.name+tag:matrix.org' };
        expect(() => validateLoginResponse(r)).not.toThrow();
    });

    it('после валидации TS сводит типы до Required — optional-поля становятся строками', () => {
        // объект с optional-полями: до валидации поля могут быть undefined,
        // assertion signature validateLoginResponse сужает их до string
        const response: {
            access_token?: string;
            user_id?: string;
            device_id?: string;
        } = { ...valid };

        validateLoginResponse(response);

        // эти присваивания компилируются только благодаря asserts-signature:
        // без него TS бы ругался на string | undefined в строковую переменную
        const token: string = response.access_token;
        const userId: string = response.user_id;
        const deviceId: string = response.device_id;

        expect(token).toBe('test-access-token');
        expect(userId).toBe('@alice:example.org');
        expect(deviceId).toBe('DEVICE1');
    });
});
