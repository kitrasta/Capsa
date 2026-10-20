// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../../../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import { getClient } from '../../../../../shared/lib/matrix';
import { useRoomListItemAvatar } from '../useRoomListItemAvatar';

afterEach(cleanup);

const mxcUrlToHttp = vi.fn(() => 'https://hs/_matrix/media/r0/download/hs/avatar');
const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['img']) }));
const createObjectURL = vi.fn(() => 'blob:avatar');
const revokeObjectURL = vi.fn();

beforeEach(() => {
    mxcUrlToHttp.mockClear();
    fetchMock.mockClear();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    fetchMock.mockResolvedValue({ ok: true, blob: async () => new Blob(['img']) });

    vi.mocked(getClient).mockReset();
    vi.mocked(getClient).mockReturnValue({
        mxcUrlToHttp,
        getAccessToken: vi.fn(() => 'access-token'),
    } as unknown as ReturnType<typeof getClient>);

    vi.stubGlobal('fetch', fetchMock);
    // jsdom не реализует object URL
    Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useRoomListItemAvatar', () => {
    it('скачивает аватар с авторизацией и отдаёт object URL', async () => {
        const { result } = renderHook(() => useRoomListItemAvatar('mxc://hs/avatar', 40));

        await waitFor(() => expect(result.current).toBe('blob:avatar'));
        expect(mxcUrlToHttp).toHaveBeenCalledWith('mxc://hs/avatar', 40, 40, 'crop', false, false, true);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://hs/_matrix/media/r0/download/hs/avatar',
            { headers: { Authorization: 'Bearer access-token' } },
        );
    });

    it('без mxc ничего не грузит', async () => {
        const { result } = renderHook(() => useRoomListItemAvatar(null, 40));

        await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it('mxc без http-URL не грузит', async () => {
        mxcUrlToHttp.mockReturnValueOnce(null as unknown as string);
        const { result } = renderHook(() => useRoomListItemAvatar('mxc://hs/avatar', 40));

        await waitFor(() => expect(mxcUrlToHttp).toHaveBeenCalled());
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.current).toBeNull();
    });

    it('ошибка скачивания не роняет хук — просто без аватара', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockRejectedValueOnce(new Error('network down'));
        const { result } = renderHook(() => useRoomListItemAvatar('mxc://hs/avatar', 40));

        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(result.current).toBeNull();
    });

    it('object URL освобождается при размонтировании', async () => {
        const { result, unmount } = renderHook(() => useRoomListItemAvatar('mxc://hs/avatar', 40));
        await waitFor(() => expect(result.current).toBe('blob:avatar'));

        unmount();

        expect(revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
    });
});
