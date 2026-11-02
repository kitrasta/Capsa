# Text MVP: исходный baseline

Дата: 2026-11-02

Исходный commit: `0b7daa62f76e293a870d13ab9b5068c98d874ea9`

Статус: **неполный baseline**. Автоматические проверки и размеры production-assets зафиксированы; тестовый набор и браузерное профилирование не завершены. Этот файл нельзя использовать как полный эталон «до» для Task 6 без повторения недостающих измерений.

## 1. Автоматические проверки

Команда из Task 1 выполнена полностью:

```bash
node --version && pnpm --version && git rev-parse HEAD && pnpm test && pnpm lint && pnpm build
```

Фактические результаты:

- Node: `v24.15.0`.
- pnpm: `12.16.1`.
- Commit: `0b7daa62f76e293a870d13ab9b5068c98d874ea9`.
- Vitest: **28/28 файлов, 174/174 tests PASS**; duration `4.67s` (`environment 55%`, `import 25%`, `tests 15%`, `transform 4%`, `worker 1%`).
- `pnpm lint`: PASS, exit code 0.
- `pnpm build`: PASS; Vite `8.2.2`, `2161 modules transformed`, `✓ built in 801ms`.
- Сохранено предупреждение Vite: `Some chunks are larger than 500 kB after minification`; предложены dynamic import/code splitting или изменение `build.chunkSizeWarningLimit`.

Для браузерного production preview выполнена отдельная сборка с обязательной конфигурацией Capsa:

```bash
VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org \
VITE_MATRIX_SERVER_NAME=capsachat.org \
pnpm build
```

Результат: PASS, `2161 modules transformed`, `✓ built in 473ms`; предупреждение о chunk size сохранилось. Только эта конфигурация используется в таблице ниже. Первый preview с непредназначенной локальной конфигурацией был отброшен и не использовался для baseline.

## 2. Размеры production-assets

Raw bytes получены непосредственно из файлов `dist`. Gzip bytes — точный результат локального `gzip.compress(..., compresslevel=9, mtime=0)`, а не округлённые значения Vite.

| Asset | Raw bytes | Gzip bytes |
|---|---:|---:|
| `dist/index.html` | 562 | 341 |
| `dist/assets/index-B3EYlOC1.js` | 1,200,248 | 349,154 |
| `dist/assets/index-Nl2oG54K.css` | 27,590 | 5,466 |
| `dist/assets/rolldown-runtime-B0Z9INg1.js` | 901 | 511 |
| `dist/assets/rust-crypto-CbAzvKQ6.js` | 226,367 | 44,688 |
| `dist/assets/matrix_sdk_crypto_wasm_bg-D1uUpLo2.wasm` | 7,826,886 | 2,092,621 |

Это размеры файлов сборки, **не браузерные transferred bytes**. Network Resource Timing не был записан.

## 3. Production preview и среда

Выполнено:

```bash
pnpm preview --host 127.0.0.1 --port 4173
curl http://127.0.0.1:4173/
```

Preview вернул HTTP 200. После остановки работы preview и браузерная сессия остановлены.

Условия, которые были настроены для браузерных проверок:

- устройство: Apple M1, 8 GB RAM, arm64;
- macOS `15.7.3`;
- Chrome `156.0.0.0` (`Macintosh; Intel Mac OS X 10_15_7` в User Agent);
- viewport `1440×900`, DPR `2`, desktop;
- CPU throttling: `1` (выключен); network throttling: выключен;
- статический preview на loopback, обращения к реальному `https://matrix.capsachat.org`; server name `capsachat.org`.

В актуальном Chrome был выполнен только smoke-до-login/отрисовки synthetic room list на неполном наборе данных. Это не является завершённым production performance baseline.

## 4. Тестовый набор

Использовались только новые test-only аккаунты и синтетические комнаты/строки; реальная переписка не использовалась. Run ID: `mvp-baseline-20261102t144431z-518fd5`.

Последний сохранённый журнал подготовки подтверждает:

- `Baseline list rooms ready: 100`;
- `Long-history room members joined`.

Однако работа была остановлена до завершения датасета:

- отдельная long-history комната создана, но **1000 текстовых событий не подтверждены**;
- exchange-комната и сценарий получения сообщения не подтверждены;
- финальная проверка `joined_rooms` и финальный metadata-файл не были получены;
- воспроизводимый набор для Task 6 поэтому не готов.

Подготовка упиралась в Synapse rate limits. Никакие настройки Synapse/PostgreSQL не изменялись. Пароли, access tokens и session JSON в документацию не включены.

## 5. Browser baseline: фактические пробелы

| Требуемая проверка | Результат |
|---|---|
| Холодный запуск | Не измерен |
| Тёплый запуск | Не измерен |
| Открытие cached room | Не измерено |
| 20 переключений комнат | Не выполнено как измеряемый сценарий |
| Непрерывный ввод | Не измерен |
| Получение сообщения | Не проверено |
| Прокрутка | Не измерена |
| Pagination и scroll anchoring | Не измерены |
| Transferred assets | Не записаны; есть только размеры файлов `dist` |
| Long Tasks | Не записаны |
| React Profiler observations | Не получены |
| Raw browser traces | Не созданы |

В git-ignored SDD workspace остались только подготовленные, но не запущенные browser-probe scripts. Их наличие не является результатом профилирования.

## 6. Подтверждённые blockers

Новых подтверждённых release blockers не зафиксировано: сценарии, необходимые для такого вывода, не были выполнены. Предупреждение о большом chunk задокументировано, но без браузерных измерений не классифицируется как blocker. Код и план не изменялись; дополнительная TDD-задача не добавлялась.

## 7. Что обязательно повторить перед Task 6

1. Завершить и проверить отдельную комнату минимум с 1000 текстовых событий и exchange test data.
2. Запустить production preview с точными `VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org` и `VITE_MATRIX_SERVER_NAME=capsachat.org`.
3. На одном и том же наборе данных записать все сценарии из раздела 5, transferred bytes, Long Tasks, React Profiler observations и raw traces.
4. Только после этого использовать значения как baseline «до» для сравнения в Task 6.
