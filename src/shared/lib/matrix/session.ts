export interface MatrixSession {
    accessToken: string,
    userId: string,
    deviceId: string,
}

const ACCESS_TOKEN_KEY = 'matrix_access_token';
const USER_ID = 'matrix_user_id';
const DEVICE_ID = 'matrix_device_id';

export function getSession():
    MatrixSession | null {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    const userId = localStorage.getItem(USER_ID);
    const deviceId = localStorage.getItem(DEVICE_ID);

    if (!accessToken || !userId || !deviceId) {
        return null;
    } else {
        return { accessToken, userId, deviceId };
    }


};

export function saveSession(session: MatrixSession):
    void {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(USER_ID, session.userId);
    localStorage.setItem(DEVICE_ID, session.deviceId);
};
