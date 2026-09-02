export interface MatrixSession {
    accessToken: string,
    userId: string,
    deviceId: string,
}

const ACCESS_TOKEN_KEY = 'matrix_access_token';
const USER_ID = 'matrix_user_id';
const DEVICE_ID = 'matrix_device_id';

export function getSession(accessToken: string, userId: string, deviceId: string):MatrixSession | null {
    if (!localStorage.getItem(ACCESS_TOKEN_KEY) ||
        !localStorage.getItem(USER_ID) ||
        !localStorage.getItem(DEVICE_ID)) {
            return null;
        } 
        return {accessToken, userId, deviceId} as MatrixSession
}

export function saveSession(session: MatrixSession): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(USER_ID, session.userId);
    localStorage.setItem(DEVICE_ID, session.deviceId);
}
