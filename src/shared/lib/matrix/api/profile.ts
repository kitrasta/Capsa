// Профиль: отображаемое имя и аватар текущего пользователя.
import { getClient } from '../client';

// смена отображаемого имени профиля
export const setDisplayName = async (name: string): Promise<void> => {
    const client = getClient();
    await client.setDisplayName(name);
};

// загрузка аватара (mxc-Url вернёт сервер)
export const setAvatar = async (file: File): Promise<void> => {
    const client = getClient();
    const { content_uri } = await client.uploadContent(file, { type: file.type });
    await client.setAvatarUrl(content_uri);
};
