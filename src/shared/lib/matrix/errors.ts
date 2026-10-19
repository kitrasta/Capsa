// Классификатор матричных ошибок. Используется менеджером lifecycle и UI,
// чтобы реакции на разные ошибки были согласованными и не дублировались
// по всем компонентам.
//
// Ошибки матричной формы (матричный ответ HTTP):
//
//   { errcode: 'M_UNKNOWN_TOKEN', ... }   токен невалиден — сессия истекла
//   { errcode: 'M_FORBIDDEN', ... }       forbidden (например, переключили
//                                          homeserver / неверный сервер)
//   { errcode: 'M_NOT_FOUND', ... }       не найдено (комната, пользователь)
//
// Ошибки SDK / HTTP-слоя без errcode (нет сети, CORS, разрыв соединения) —
// не считаются известными и остаются generic 'error'.

export interface MatrixError {
    errcode?: string;
    error?: string;
    [key: string]: unknown;
}

/** Проверить, является ли ошибка матричной ошибкой с заданным errcode. */
const isErrcode = (error: unknown, code: string): boolean =>
    error != null &&
    typeof error === 'object' &&
    'errcode' in error &&
    (error as { errcode: unknown }).errcode === code;

export const isUnknownTokenError = (error: unknown): boolean =>
    isErrcode(error, 'M_UNKNOWN_TOKEN');

export const isForbiddenError = (error: unknown): boolean =>
    isErrcode(error, 'M_FORBIDDEN');

export const isNotFoundError = (error: unknown): boolean =>
    isErrcode(error, 'M_NOT_FOUND');

/** Человеческое сообщение для матричной ошибки (не показывает чувствительные данные). */
export const matrixErrorMessage = (error: unknown): string => {
    if (error != null && typeof error === 'object' && 'error' in error) {
        const msg = (error as MatrixError).error;
        if (typeof msg === 'string' && msg) return msg;
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Неизвестная ошибка';
};
