// Пользователи: поиск по директории людей homeserver'а.
import { getClient } from '../client';

export interface UserSearchResult {
    userId: string;
    displayName?: string;
    avatarUrl?: string;
}

// поиск по директории людей homeserver'а
// (матчатся userId, display name и домен)
export const searchUsers = async (
    query: string
): Promise<UserSearchResult[]> => {
    const client = getClient();
    const response = await client.searchUserDirectory({
        term: query,
        limit: 10,
    });
    return response.results.map((result) => ({
        userId: result.user_id,
        displayName: result.display_name ?? undefined,
        avatarUrl: result.avatar_url ?? undefined,
    }));
}
