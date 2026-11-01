import { useEffect, useRef, useState } from 'react';
import { Check, KeyRound, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { VerificationMethod } from 'matrix-js-sdk/lib/types';
import {
    VerificationPhase,
    VerificationRequestEvent,
} from 'matrix-js-sdk/lib/crypto-api';
import type {
    EmojiMapping,
    ShowSasCallbacks,
    VerificationRequest,
    Verifier,
} from 'matrix-js-sdk/lib/crypto-api';
import {
    getEncryptionRecoveryStatus,
    recoverEncryptionWithKey,
    requestOwnDeviceVerification,
    restoreKeysAfterVerification,
} from '../../shared/lib/matrix';
import Modal from '../../shared/ui/Modal/Modal';
import styles from './EncryptionRecovery.module.css';

interface DialogProps {
    onClose: () => void;
    onRecovered: () => void;
}

const recoveryErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : '';
    if (/parity|prefix|length|base58/i.test(message)) {
        return 'Неверный формат recovery key. Проверьте ключ и попробуйте снова.';
    }
    return 'Не удалось восстановить ключи. Проверьте recovery key и соединение.';
};

const EncryptionRecoveryDialog = ({ onClose, onRecovered }: DialogProps) => {
    const [mode, setMode] = useState<'recovery' | 'verification'>('recovery');
    const [recoveryKey, setRecoveryKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [verificationPhase, setVerificationPhase] = useState<VerificationPhase | null>(null);
    const [sas, setSas] = useState<EmojiMapping[] | null>(null);
    const [sasCallbacks, setSasCallbacks] = useState<ShowSasCallbacks | null>(null);
    const [verificationNotice, setVerificationNotice] = useState(
        'Отправьте запрос, затем откройте Element и подтвердите его.',
    );

    const requestRef = useRef<VerificationRequest | null>(null);
    const verificationPromiseRef = useRef<Promise<void> | null>(null);
    const verificationCompletedRef = useRef(false);
    const disposedRef = useRef(false);

    const finishVerification = async () => {
        if (verificationCompletedRef.current || disposedRef.current) return;
        verificationCompletedRef.current = true;
        try {
            const result = await restoreKeysAfterVerification();
            if (disposedRef.current) return;
            setSuccessMessage(
                result.backupRestored
                    ? `Устройство подтверждено. Восстановлено ключей: ${result.imported}.`
                    : 'Устройство подтверждено. Другой клиент не передал ключи старой истории — для неё используйте recovery key.',
            );
        } catch (verificationError) {
            console.error('Failed to restore keys after verification', verificationError);
            if (!disposedRef.current) {
                setError('Устройство подтверждено, но восстановить старую историю не удалось.');
            }
        }
    };

    const watchVerifier = (verifier: Verifier) => {
        const callbacks = verifier.getShowSasCallbacks();
        if (callbacks) {
            setSasCallbacks(callbacks);
            setSas(callbacks.sas.emoji ?? null);
        }
        if (verificationPromiseRef.current) return;

        verificationPromiseRef.current = verifier
            .verify()
            .then(finishVerification)
            .catch((verificationError: unknown) => {
                console.error('Device verification failed', verificationError);
                if (!disposedRef.current) {
                    setError('Верификация была отменена или не завершилась. Попробуйте снова.');
                }
            });
    };

    const attachRequest = (request: VerificationRequest) => {
        requestRef.current = request;
        const handleChange = () => {
            if (disposedRef.current) return;
            setVerificationPhase(request.phase);

            if (request.phase === VerificationPhase.Cancelled) {
                setError('Запрос на верификацию был отклонён.');
            }
            if (request.verifier) watchVerifier(request.verifier);
            if (request.phase === VerificationPhase.Done) {
                void finishVerification();
            }
        };
        request.on(VerificationRequestEvent.Change, handleChange);
        handleChange();
    };

    useEffect(() => {
        return () => {
            disposedRef.current = true;
            const request = requestRef.current;
            request?.removeAllListeners(VerificationRequestEvent.Change);
            if (request?.pending) void request.cancel().catch(() => undefined);
        };
    }, []);

    const handleRecover = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!recoveryKey.trim() || busy) return;

        setBusy(true);
        setError(null);
        try {
            const result = await recoverEncryptionWithKey(recoveryKey);
            setRecoveryKey('');
            setSuccessMessage(`Готово. Восстановлено ключей: ${result.imported}.`);
        } catch (recoveryError) {
            console.error('Failed to recover encryption keys', recoveryError);
            setError(recoveryErrorMessage(recoveryError));
        } finally {
            setBusy(false);
        }
    };

    const handleRequestVerification = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
            const request = await requestOwnDeviceVerification();
            attachRequest(request);
            setVerificationNotice('Запрос отправлен. Подтвердите его в Element.');
        } catch (verificationError) {
            console.error('Failed to request device verification', verificationError);
            setError('Не удалось отправить запрос. Для этого аккаунта используйте recovery key.');
        } finally {
            setBusy(false);
        }
    };

    const handleStartSas = async () => {
        const request = requestRef.current;
        if (!request || busy) return;
        setBusy(true);
        setError(null);
        try {
            const verifier = await request.startVerification(VerificationMethod.Sas);
            watchVerifier(verifier);
            setVerificationNotice('Сравните эмодзи с теми, которые показаны в Element.');
        } catch (verificationError) {
            console.error('Failed to start SAS verification', verificationError);
            setError('Не удалось начать проверку эмодзи.');
        } finally {
            setBusy(false);
        }
    };

    const handleConfirmSas = async () => {
        if (!sasCallbacks || busy) return;
        setBusy(true);
        setError(null);
        try {
            await sasCallbacks.confirm();
            setVerificationNotice('Эмодзи подтверждены. Завершаем верификацию…');
        } catch (verificationError) {
            console.error('Failed to confirm SAS', verificationError);
            setError('Не удалось подтвердить эмодзи.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Восстановить шифрование">
            {successMessage ? (
                <div className={styles.success}>
                    <span className={styles.successIcon}><Check size={26} /></span>
                    <p>{successMessage}</p>
                    <button className={styles.primaryButton} onClick={onRecovered}>
                        Продолжить
                    </button>
                </div>
            ) : (
                <div className={styles.wrapper}>
                    <div className={styles.intro}>
                        <ShieldCheck size={28} />
                        <p>
                            Это нужно один раз для нового устройства. После восстановления
                            ключи сохранятся в этом браузере.
                        </p>
                    </div>

                    <div className={styles.tabs}>
                        <button
                            className={mode === 'recovery' ? styles.tabActive : styles.tab}
                            onClick={() => { setMode('recovery'); setError(null); }}
                        >
                            <KeyRound size={17} /> Recovery key
                        </button>
                        <button
                            className={mode === 'verification' ? styles.tabActive : styles.tab}
                            onClick={() => { setMode('verification'); setError(null); }}
                        >
                            <Smartphone size={17} /> Element
                        </button>
                    </div>

                    {mode === 'recovery' ? (
                        <form className={styles.form} onSubmit={handleRecover}>
                            <label htmlFor="recovery-key">Ключ восстановления</label>
                            <textarea
                                id="recovery-key"
                                className={styles.input}
                                value={recoveryKey}
                                onChange={(event) => setRecoveryKey(event.target.value)}
                                placeholder="EsTz .... .... ...."
                                autoComplete="off"
                                spellCheck={false}
                                rows={3}
                                disabled={busy}
                                autoFocus
                            />
                            <p className={styles.hint}>
                                Ключ используется только в этой вкладке и не сохраняется в localStorage.
                            </p>
                            <button
                                className={styles.primaryButton}
                                type="submit"
                                disabled={!recoveryKey.trim() || busy}
                            >
                                {busy && <Loader2 className={styles.spinner} size={17} />}
                                {busy ? 'Восстанавливаем…' : 'Восстановить сообщения'}
                            </button>
                        </form>
                    ) : (
                        <div className={styles.verification}>
                            <p className={styles.hint}>{verificationNotice}</p>

                            {verificationPhase === null && (
                                <button
                                    className={styles.primaryButton}
                                    onClick={handleRequestVerification}
                                    disabled={busy}
                                >
                                    {busy && <Loader2 className={styles.spinner} size={17} />}
                                    Отправить запрос в Element
                                </button>
                            )}

                            {verificationPhase === VerificationPhase.Ready && (
                                <button
                                    className={styles.primaryButton}
                                    onClick={handleStartSas}
                                    disabled={busy}
                                >
                                    Показать эмодзи
                                </button>
                            )}

                            {sas && (
                                <>
                                    <div className={styles.sasGrid}>
                                        {sas.map(([emoji, name], index) => (
                                            <span key={`${name}-${index}`} title={name}>{emoji}</span>
                                        ))}
                                    </div>
                                    <p className={styles.hint}>Они совпадают с эмодзи в Element?</p>
                                    <div className={styles.actions}>
                                        <button
                                            className={styles.primaryButton}
                                            onClick={handleConfirmSas}
                                            disabled={busy}
                                        >
                                            Совпадают
                                        </button>
                                        <button
                                            className={styles.secondaryButton}
                                            onClick={() => {
                                                sasCallbacks?.mismatch();
                                                setError('Эмодзи не совпали. Запрос отменён.');
                                            }}
                                        >
                                            Не совпадают
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {error && <p className={styles.error}>{error}</p>}
                </div>
            )}
        </Modal>
    );
};

const EncryptionRecoveryGate = () => {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let active = true;
        getEncryptionRecoveryStatus()
            .then((status) => {
                if (active && status.required) setIsOpen(true);
            })
            .catch((error: unknown) => {
                console.warn('Failed to check encryption recovery status', error);
            });
        return () => {
            active = false;
        };
    }, []);

    if (!isOpen) return null;
    return (
        <EncryptionRecoveryDialog
            onClose={() => setIsOpen(false)}
            onRecovered={() => setIsOpen(false)}
        />
    );
};

export default EncryptionRecoveryGate;
