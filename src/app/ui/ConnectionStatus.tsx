import { useEffect, useState } from 'react';
import { ClientEvent, SyncState } from 'matrix-js-sdk';
import { getClient } from '../../shared/lib/matrix';
import styles from './ConnectionStatus.module.css';

const ConnectionStatus = () => {
    const [syncState, setSyncState] = useState<SyncState | null>(() =>
        getClient().getSyncState(),
    );

    useEffect(() => {
        const client = getClient();
        const handleSync = (state: SyncState) => setSyncState(state);

        client.on(ClientEvent.Sync, handleSync);
        return () => {
            client.off(ClientEvent.Sync, handleSync);
        };
    }, []);

    if (syncState !== SyncState.Error && syncState !== SyncState.Reconnecting) {
        return null;
    }

    return (
        <div className={styles.banner} role="status">
            Нет соединения. Пытаемся восстановить…
        </div>
    );
};

export default ConnectionStatus;
