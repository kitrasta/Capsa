# Text MVP: исходный baseline

Дата измерений: 2026-11-02

Исходный application commit: `0b7daa62f76e293a870d13ab9b5068c98d874ea9`. Последующие изменения до измерений были documentation-only; production source не менялся.

Статус: **полный baseline Task 1**. Датасет проверен, все обязательные browser scenarios выполнены против production-сборки и реального Matrix. Подтверждён один pagination blocker; для него в план добавлена Task 5A.

## 1. Автоматические проверки

Выполнена исходная команда:

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
- Предупреждение Vite: `Some chunks are larger than 500 kB after minification`.

Для browser baseline использована отдельная сборка с обязательной конфигурацией:

```bash
VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org \
VITE_MATRIX_SERVER_NAME=capsachat.org \
pnpm build
```

Результат последней такой сборки перед измерениями: PASS, `2161 modules transformed`, `✓ built in 472ms`; предупреждение о chunk size сохранилось.

## 2. Размеры production-assets

Raw bytes получены из файлов `dist`. Gzip bytes — точный результат `gzip.compress(..., compresslevel=9, mtime=0)`, а не округлённые значения Vite и не browser transferred bytes.

| Asset | Raw bytes | Gzip bytes |
|---|---:|---:|
| `dist/index.html` | 562 | 341 |
| `dist/assets/index-B3EYlOC1.js` | 1,200,248 | 349,154 |
| `dist/assets/index-Nl2oG54K.css` | 27,590 | 5,466 |
| `dist/assets/rolldown-runtime-B0Z9INg1.js` | 901 | 511 |
| `dist/assets/rust-crypto-CbAzvKQ6.js` | 226,367 | 44,688 |
| `dist/assets/matrix_sdk_crypto_wasm_bg-D1uUpLo2.wasm` | 7,826,886 | 2,092,621 |

## 3. Воспроизводимый тестовый набор

Используются только test-only аккаунты, комнаты и синтетические строки. Реальная переписка не использовалась. Пароли, tokens и session JSON не входят в документацию.

- Run ID: `mvp-baseline-20261102t144431z-518fd5`.
- Homeserver: `https://matrix.capsachat.org`; server name: `capsachat.org`.
- Joined rooms основного test user: **102**.
- Комнат для сценариев списка/переключений: **100**; их room IDs сохранены в metadata.
- Long-history room: `!MmIVEy2hesBHKoiqFtAGE0nwl5KGJWlLOHYt5NqlbVw`.
- Проверено ровно **1000 `m.room.message` с `msgtype=m.text`** в long-history room; подсчёт выполнен повторным чтением 11 страниц `/messages`.
- Exchange room: `!VvHEsjFCSvJ_OFgyplWqbJ-5-cHOFfG7wU4rTo-t5BM`; seed message и последующие live receive probes отправлены вторым сохранённым test session.
- Non-secret metadata: `.superpowers/sdd/2026-11-02-text-mvp-stabilization/task-1-dataset.json`.
- Verification log: `.superpowers/sdd/2026-11-02-text-mvp-stabilization/task-1b-dataset.log`; финальная строка `COMPLETE joined_rooms=102 list_rooms=100 long_text_events=1000 exchange=ready`.

Task 6 должен использовать тот же run ID, те же room IDs и отсутствие новых сообщений в long-history room во время сравнения «до/после».

## 4. Среда и метод

- Устройство: Apple M1, 8 GB RAM, arm64; macOS `15.7.3`.
- Chrome `156.0.0.0`.
- Viewport `1440×900`, DPR `2`, desktop.
- CPU throttling: `1` (выключен); network throttling: выключен.
- `pnpm preview --host 127.0.0.1 --port 4173`, HTTP 200; production build обращается к реальному `matrix.capsachat.org`.
- Холодный запуск: новый isolated browser context, session установлен через статический text-only bootstrap без загрузки application assets, затем `/chats` с `ignoreCache=true`.
- Тёплый запуск: тот же context после холодного, повторный `/chats` с `ignoreCache=false`.
- `PerformanceObserver` собирал Long Tasks. Browser-only React DevTools hook собирал root commits; production fibers не предоставляют `actualDuration`/`actualStartTime`, поэтому эти поля равны `null` и не выдумываются.
- Startup Long Tasks ниже отфильтрованы по `startTime < baselineRoomsReadyAt`. Для startup transferred bytes указаны Resource Timing assets + navigation document, включая HTTP overhead.
- Pagination probe использует `scrollTo({ top: 0, behavior: 'instant' })` только для установки начальной позиции; компенсация приложения и её smooth CSS не изменялись. Сняты immediate и settled offsets.

Общий префикс artifacts ниже: `.superpowers/sdd/2026-11-02-text-mvp-stabilization/`.

## 5. Startup и transferred assets

| Метрика | Cold | Warm |
|---|---:|---:|
| Room list ready (`baselineRoomsReadyAt`) | 2932.900 ms | 3226.400 ms |
| `domContentLoadedEventEnd` | 311.500 ms | 474.700 ms |
| `loadEventEnd` | 312.100 ms | 474.800 ms |
| Chrome trace LCP | 1546 ms | 1730 ms |
| Resource `transferSize` | 8,231,470 B | 7,828,686 B |
| Navigation document `transferSize` | 862 B | 300 B |
| **Total transferred, resources + document** | **8,232,332 B** | **7,828,986 B** |
| Encoded body, resources + document | 8,230,232 B | 8,230,232 B |
| Long Tasks до ready | 3 | 4 |
| Long Tasks total duration до ready | 382 ms | 1610 ms |
| Max Long Task до ready | 204 ms | 1052 ms |
| React root commits до снятия metrics | 5 | 5 |

Cold передаёт main JS как `351243 B`, CSS как `5832 B`, Rust crypto JS как `45146 B`, WASM как `7827186 B`. Warm повторно получает WASM по сети (`7827186 B`); main JS/CSS/Rust JS обслуживаются из cache с `transferSize=300 B` каждый. Это фактические результаты Vite preview, а не production Caddy cache policy.

Artifacts:

- `metrics/cold-start-unprimed.json`, `traces/cold-start-unprimed.trace.json.gz`.
- `metrics/warm-start-unprimed.json`, `traces/warm-start-unprimed.trace.json.gz`.

Один cold/warm pair не используется для вывода, что warm обязан быть быстрее; сравнение после изменений выполняется тем же методом.

## 6. Interaction baseline

| Сценарий | Фактический результат | Long Tasks | React commits |
|---|---|---:|---:|
| Cached long-room open | 2904.800 ms до первых 8 rendered messages | 10; total 2148 ms; max 952 ms | 2 |
| 20 room switches | 20 уникальных routes; mean render 15.845 ms, max 23 ms; total с pause 100 ms 2355.800 ms | 1; 58 ms | 56 |
| Непрерывный ввод | 180 input events на 1000 rendered messages; 3344.400 ms total, mean 18.437 ms/char, max 51.700 ms/char; final value совпал | 1; 52 ms | 181 |
| Получение сообщения | Marker установлен до send от session B; 2→3 messages, received=true, latency 6463 ms | 2; total 110 ms; max 57 ms | 2 |
| Прокрутка | 30 steps за 481.600 ms; 0 dropped probe steps; scrollHeight 11532, clientHeight 770 | 0 | 0 |
| Pagination, settled | 88→168 messages за 2041.500 ms; **anchor delta 1822 px** | 0 | 6 |
| Загрузка всей истории для typing | 248→1000 messages, 8 probe pages, 13249.100 ms | 42; total 4789 ms; max 449 ms | 60 |

Additional observations:

- Во время 180 символов React hook зарегистрировал 181 root commit. Это воспроизводимая точка сравнения для Task 5; production Profiler durations недоступны.
- Pagination immediate offset был 3266.500 px, settled offset 1822 px. Проблема не является артефактом одного animation frame.
- Live receive latency включает Matrix send/sync и измеряется от armed browser observer до double-RAF после появления marker.
- Для всех interaction scenarios есть raw traces; отсутствие Long Tasks в scroll/pagination означает именно отсутствие записанных задач длиннее 50 ms, а не отсутствие observer.

Artifacts:

- `metrics/cached-room-open.json`, `traces/cached-room-open.trace.json.gz`.
- `metrics/room-switches-20.json`, `traces/room-switches-20.trace.json.gz`.
- `metrics/typing-180.json`, `traces/typing-180.trace.json.gz`.
- `metrics/receive-final.json`, `traces/receive-final.trace.json.gz`.
- `metrics/scroll.json`, `traces/scroll.trace.json.gz`.
- `metrics/pagination-anchor-verified.json`, `traces/pagination-anchor-verified.trace.json.gz`.
- `metrics/load-all-history.json`, `traces/load-all-history.trace.json.gz`.

## 7. Подтверждённый blocker

### B1: Pagination теряет scroll anchor и запускает лишнюю загрузку

**Reproduction:** открыть cached long-history room на production preview, дождаться стабильных 88 rendered messages, мгновенно перейти к `scrollTop=0` и инициировать pagination. Дождаться окончания загрузки и стабилизации scroll.

**Ожидаемое:** одна ручная pagination сохраняет viewport offset исходного первого сообщения; auto-fill не добавляет страницу с `keepPosition=false`, пока compensation не завершена.

**Фактическое:** исходный anchor имел `getBoundingClientRect().top=128 px`; после 88→168 messages и стабилизации offset стал `1950 px`, то есть сместился на **1822 px**. Immediate delta — 3266.500 px. В raw trace виден layout shift; hook зарегистрировал 6 commits. Сценарий воспроизведён также на втором наборе страниц с другим начальным offset.

**Owning files:** `src/widgets/Chat/ChatView.tsx`, `src/widgets/Chat/hooks/useAutoLoadHistory.ts`; smooth behavior задан в `src/widgets/Chat/ChatView.module.css`.

**Regression test:** `src/widgets/Chat/__tests__/ChatView.test.tsx`, добавленный планом Task 5A. Тест обязан сначала воспроизвести повторную автозагрузку/смещение, затем проверить `anchorPixelDelta=0px` после стабилизации и отсутствие лишней страницы.

План дополнен Task 5A с RED→GREEN шагами, точными файлами и командами. Дефект в этой задаче не исправлялся.

Других release blockers не подтверждено. Chunk-size warning и измеренные Long Tasks являются baseline observations для Tasks 5/6, а не автоматически новыми блокерами.

## 8. Повторение для Task 6

1. Использовать тот же dataset и production env из разделов 1 и 3.
2. Повторить probes с тем же устройством, viewport и отключённым throttling.
3. Сравнить transferred bytes, ready/LCP, Long Tasks, React commits и каждый interaction scenario с таблицами выше.
4. Отдельно проверить, что Task 5 устраняет прежний typing hotspot, а Task 5A возвращает pagination anchor к `0px` без новой функциональности.
