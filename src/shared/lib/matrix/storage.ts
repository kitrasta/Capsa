// IndexedDB-хранилище Matrix-клиента: создание store, закрытие соединений
// и удаление баз. Все обращения к IndexedDB живут здесь — остальной код
// работает с этими операциями, а не с request/событиями напрямую.
import { IndexedDBStore, MemoryStore } from 'matrix-js-sdk';

// имя базы room-стора
export const ROOM_STORE_DB_NAME = 'capsa-matrix-store';

// ссылка на room-стор: при остановке/выходе нужно закрыть его соединение
// с IndexedDB, иначе deleteDatabase упрётся в blocked и операция повиснет
let roomStore: IndexedDBStore | null = null;

// store клиента: IndexedDB (с падением на MemoryStore, если база недоступна)
export const createStore = async (): Promise<IndexedDBStore | MemoryStore> => {
    try {
        const store = new IndexedDBStore({
            indexedDB: window.indexedDB,
            localStorage: window.localStorage,
            dbName: ROOM_STORE_DB_NAME,
        });
        await store.startup();
        roomStore = store;
        return store;
    } catch (error) {
        console.warn('IndexedDB store failed, falling back to MemoryStore', error);
        roomStore = null;
        return new MemoryStore();
    }
};

// закрыть соединение с room-стором, не трогая данные (остановка клиента)
export const closeRoomStore = async (): Promise<void> => {
    if (!roomStore) return;
    const store = roomStore;
    roomStore = null;
    await store.destroy();
};

// стереть данные room-стора и закрыть соединение (logout):
// сначала deleteAllData, потом destroy — иначе останутся старые комнаты
export const wipeRoomStore = async (): Promise<void> => {
    if (!roomStore) return;
    const store = roomStore;
    roomStore = null;
    await store.deleteAllData();
    await store.destroy();
};

// удаление базы IndexedDB с проверкой результата:
// deleteDatabase возвращает request с событиями — оборачиваем в Promise,
// чтобы не считать операцию успешной при неудалении.
// blocked = базу держит открытое соединение: не завершаем promise,
// а репортим ошибку — операция не должна висеть вечно
export const deleteDatabase = (name: string): Promise<void> =>
    new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () =>
            reject(
                request.error ??
                    new Error(`Не удалось удалить IndexedDB: ${name}`),
            );
        request.onblocked = () =>
            reject(
                new Error(
                    `База ${name} заблокирована открытым соединением (blocked)`,
                ),
            );
    });
