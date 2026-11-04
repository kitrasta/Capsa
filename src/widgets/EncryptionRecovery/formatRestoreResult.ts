// imported без total неотличим от сбоя: «Восстановлено ключей: 0» — это
// и пустой backup (легитимно), и «0 из 50» (ключи есть, но не импортированы).
// Форматируем по { imported, total }, чтобы пользователь понимал исход.
export const formatRestoreResult = (result: {
    imported: number;
    total: number;
}): string => {
    if (result.total === 0) {
        return 'Готово. Резервная копия не содержит ключей — старых зашифрованных сообщений для восстановления нет.';
    }
    if (result.imported === 0) {
        return `Восстановлено ключей: 0 из ${result.total}. Они уже есть на этом устройстве или недоступны.`;
    }
    return `Готово. Восстановлено ключей: ${result.imported} из ${result.total}.`;
};
