// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ClientEvent, SyncState } from 'matrix-js-sdk';
import type { MatrixClient } from 'matrix-js-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/lib/matrix', () => ({ getClient: vi.fn() }));

import ConnectionStatus from './ConnectionStatus';
import { getClient } from '../../shared/lib/matrix';

afterEach(cleanup);

describe('ConnectionStatus', () => {
    it('показывает восстановление соединения и отписывает тот же listener', () => {
        const on = vi.fn();
        const off = vi.fn();
        const client = {
            getSyncState: vi.fn().mockReturnValue(SyncState.Error),
            on,
            off,
        };
        vi.mocked(getClient).mockReturnValue(client as unknown as MatrixClient);

        const { unmount } = render(<ConnectionStatus />);

        expect(screen.getByRole('status').textContent).toBe(
            'Нет соединения. Пытаемся восстановить…',
        );
        const syncListener = on.mock.calls.find(
            ([event]) => event === ClientEvent.Sync,
        )?.[1] as (state: SyncState) => void;
        expect(syncListener).toBeDefined();

        act(() => syncListener(SyncState.Reconnecting));
        expect(screen.getByRole('status')).toBeTruthy();

        act(() => syncListener(SyncState.Prepared));
        expect(screen.queryByRole('status')).toBeNull();

        act(() => syncListener(SyncState.Syncing));
        expect(screen.queryByRole('status')).toBeNull();

        unmount();
        expect(off).toHaveBeenCalledTimes(1);
        expect(off).toHaveBeenCalledWith(ClientEvent.Sync, syncListener);
    });
});
