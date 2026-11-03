# Text MVP: итоговая проверка производительности

Дата повторных измерений: 2026-11-03

Final application commit: `c72f33b648f03d9f4d1138ff218bf55fc4c03c54`. Сравнение выполнено с `docs/mvp/baseline.md` (application commit `0b7daa62f76e293a870d13ab9b5068c98d874ea9`) и наблюдениями Tasks 5/5A.

**Итог decision gates:** typing hotspot больше не воспроизводится, но pagination blocker остаётся на final HEAD. В план добавлена Task 5B с failing-test/browser-benchmark контрактом. Виртуализация и дополнительный code splitting для MVP не внедряются: для них нет отдельного подтверждённого blocker. Release performance gate остаётся открытым до Task 5B.

## 1. Автоматические проверки

Выполнено на final HEAD:

```bash
pnpm test && pnpm lint && pnpm build
```

- Node `v24.15.0`, pnpm `12.16.1`.
- Vitest: **31/31 файлов, 190/190 tests PASS**, duration `4.15s`.
- ESLint: PASS, exit code 0.
- Build: PASS, Vite `8.2.2`, `2164 modules transformed`, `✓ built in 441ms`.
- Отдельная production-configured сборка с `VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org` и `VITE_MATRIX_SERVER_NAME=capsachat.org`: PASS, `2164 modules`, `✓ built in 442ms`.
- Предупреждение о chunks больше 500 kB сохраняется.

Логи: `task-6-automatic.log`, `task-6-production-build.log` в SDD workspace.

## 2. Идентичные данные, среда и метод

- Run ID: `mvp-baseline-20261102t144431z-518fd5`; те же 100 list rooms, 102 joined rooms и long-history room с 1000 текстовых событий.
- Использованы только сохранённые test sessions. Не было account creation, login, server changes или новых сообщений в long-history room. Live receive отправлен только в exchange room с уникальной синтетической меткой `task6-0001`.
- Apple M1, 8 GB RAM, arm64; macOS `15.7.3`; Chrome `156.0.0.0`.
- Viewport `1440×900`, DPR `2`, desktop; CPU throttling `1`, network throttling off.
- Production preview: `pnpm preview --host 127.0.0.1 --port 4173`, реальный `matrix.capsachat.org`.
- Cold: новый isolated context, session установлен через text-only `dist/session-probe.txt` без application assets, затем `/chats` с `ignoreCache=true`. Warm: тот же context, повторный `/chats` с `ignoreCache=false`.
- Использованы сохранённые scripts из `browser/`: те же startup observers, cached open, 20 switches, 180-character typing, scroll, pagination, full-history load и armed live receive.
- `PerformanceObserver` собирал Long Tasks; browser-only React DevTools hook — root commits. Production fibers по-прежнему не предоставляют `actualDuration`/`actualStartTime` (`null`).
- Startup Long Tasks отфильтрованы по `startTime < baselineRoomsReadyAt`. Transferred bytes — Resource Timing + navigation document, включая HTTP overhead.

Общий префикс artifacts: `.superpowers/sdd/2026-11-02-text-mvp-stabilization/`.

## 3. Production asset sizes

Raw bytes получены из `dist`; gzip — точный `gzip.compress(..., compresslevel=9, mtime=0)`.

| Asset | Baseline raw / gzip, B | Final raw / gzip, B |
|---|---:|---:|
| `index.html` | 562 / 341 | 562 / 339 |
| Main JS | 1,200,248 / 349,154 | 1,201,015 / 349,440 |
| CSS | 27,590 / 5,466 | 27,778 / 5,491 |
| Rolldown runtime JS | 901 / 511 | 901 / 511 |
| Rust crypto JS | 226,367 / 44,688 | 226,367 / 44,689 |
| Rust crypto WASM | 7,826,886 / 2,092,621 | 7,826,886 / 2,092,621 |

Final filenames: `index-CaAnUNY6.js`, `index-0mHeDx6a.css`, `rust-crypto-4-PDUUnV.js`, `rolldown-runtime-B0Z9INg1.js`, `matrix_sdk_crypto_wasm_bg-D1uUpLo2.wasm`. Размеры: `task-6-asset-sizes.txt`.

## 4. Startup и transferred bytes

| Метрика | Cold baseline | Cold final | Warm baseline | Warm final |
|---|---:|---:|---:|---:|
| Room list ready | 2932.900 ms | 2730.800 ms | 3226.400 ms | 1677.900 ms |
| `domContentLoadedEventEnd` | 311.500 ms | 180.200 ms | 474.700 ms | 131.100 ms |
| `loadEventEnd` | 312.100 ms | 180.300 ms | 474.800 ms | 131.200 ms |
| Chrome trace LCP | 1546 ms | 1367 ms | 1730 ms | 753 ms |
| Resource `transferSize` | 8,231,470 B | 8,231,782 B | 7,828,686 B | 7,828,686 B |
| Navigation document `transferSize` | 862 B | 862 B | 300 B | 300 B |
| **Total transferred, resources + document** | **8,232,332 B** | **8,232,644 B** | **7,828,986 B** | **7,828,986 B** |
| Encoded body, resources + document | 8,230,232 B | 8,230,544 B | 8,230,232 B | 8,230,544 B |
| Long Tasks до ready | 3 | 3 | 4 | 1 |
| Total Long Task duration до ready | 382 ms | 565 ms | 1610 ms | 425 ms |
| Max Long Task до ready | 204 ms | 425 ms | 1052 ms | 425 ms |
| React root commits | 5 | 6 | 5 | 6 |

Cold final передаёт main JS `351528 B`, CSS `5858 B`, Rust crypto JS `45147 B`, WASM `7827186 B`. Warm final повторно получает WASM по сети; остальные assets имеют `transferSize=300 B`. Это Vite preview cache behavior, не production Caddy policy.

Один cold/warm pair на каждой версии не доказывает статистически устойчивое ускорение. Зафиксированы только фактические наблюдения; transferred bytes не уменьшились.

Artifacts:

- `metrics/task-6-cold-start.json`, `traces/task-6-cold-start.trace.json.gz`.
- `metrics/task-6-warm-start.json`, `traces/task-6-warm-start.trace.json.gz`.

## 5. Interaction comparison

| Сценарий / метрика | Baseline | Final Task 6 |
|---|---:|---:|
| Cached long-room open | 2904.800 ms; первые 8 messages | 248.700 ms; первые 8 messages |
| Cached open Long Tasks | 10; total 2148 ms; max 952 ms | 1; total 142 ms; max 142 ms |
| Cached open React commits | 2 | 2 |
| 20 switches | 20 unique routes; mean 15.845 ms; max 23 ms; total с pause 2355.800 ms | 20 unique routes; mean 19.420 ms; max 88.100 ms; total с pause 2399.200 ms |
| Switches Long Tasks / React commits | 1; 58 ms / 56 | 0 / 55 |
| Typing, 180 chars на 1000 messages | 3344.400 ms; mean 18.437 ms; max 51.700 ms | 3039.000 ms; mean 16.691 ms; max 30.800 ms |
| Typing Long Tasks / React commits | 1; 52 ms / 181 | **0 / 182** |
| Typing final value | совпал | совпал |
| Live receive | 2→3 messages; 6463 ms | 3→4 messages; 5884.800 ms |
| Receive Long Tasks / React commits | 2; total 110 ms; max 57 ms / 2 | 0 / 2 |
| Scroll | 30 steps; 481.600 ms; 0 Long Tasks | 30 steps; 468.700 ms; 0 Long Tasks |
| Full history | 248→1000 messages; 8 probe pages; 13249.100 ms | 168→1000 messages; 21 probe pages; 9033.400 ms |
| Full-history Long Tasks | 42; total 4789 ms; max 449 ms | 26; total 2743 ms; max 350 ms |
| Full-history React commits | 60 | 61 |

Task 5 промежуточный typing probe также показал 0 Long Tasks, 3064 ms total, mean 16.83 ms, max 37.70 ms и 181 commits. Final probe подтверждает отсутствие прежнего 52 ms derived-timeline Long Task; умеренные различия mean/max остаются однократными наблюдениями. Один root commit на keystroke и связанные React commits сохраняются — memoization устраняет повторный derived-timeline расчёт, а не весь React rendering.

Full-history final начался со 168 messages вместо baseline 248 из-за другой последовательности auto-fill/pagination. Поэтому duration и aggregate Long Tasks нельзя трактовать как чистое измеренное улучшение; сопоставимы dataset, probe и достигнутые 1000 messages. Массовая загрузка истории по-прежнему создаёт Long Tasks и остаётся ограничением.

Live receive latency включает Matrix send/sync и зависит от сети; разница одного запуска не заявляется как улучшение. Cached-open разница также не приписывается Task 5 без отдельного профиля причины.

Artifacts:

- `metrics/task-6-cached-room-open.json`, `traces/task-6-cached-room-open.trace.json.gz`.
- `metrics/task-6-room-switches-20.json`, `traces/task-6-room-switches-20.trace.json.gz`.
- `metrics/task-6-typing-180.json`, `traces/task-6-typing-180.trace.json.gz`.
- `metrics/task-6-receive.json`, `traces/task-6-receive.trace.json.gz`.
- `metrics/task-6-scroll.json`, `traces/task-6-scroll.trace.json.gz`.
- `metrics/task-6-load-all-history.json`, `traces/task-6-load-all-history.trace.json.gz`.

## 6. Pagination: blocker воспроизведён на final HEAD

| Метрика | Baseline | Task 5A observation | Final Task 6 |
|---|---:|---:|---:|
| Messages before → after | 88→168 | 88→128 | 88→168 |
| Pages added | 2 | 1 | 2 |
| Anchor top before | 128 px | 128 px | 128 px |
| Immediate anchor delta | 3266.500 px | 0 px | 1880 px |
| Settled anchor delta | **1822 px** | **0 px** | **1880 px** |
| Probe duration | 2041.500 ms | 998 ms | 1515.700 ms |
| Long Tasks | 0 | 0 | 1; 65 ms |
| React commits | 6 | не записаны в sanitized metrics | 7 |

Таким образом, наблюдение Task 5A на исходном fix commit не воспроизвелось на final HEAD `c72f33b`, включающем stale-anchor cleanup. Повторный probe на следующем диапазоне также дал две страницы: 168→288 messages, immediate delta 1822 px, settled delta 3606 px.

Browser-only instrumentation `Element.prototype.scrollTo` локализовала последовательность второго probe:

1. Probe установил `top=0` при 168 messages и `scrollHeight=7874`.
2. До prepend приложение вызвало `scrollTo({ top: 26, behavior: 'instant' })` при тех же 168 messages и `scrollHeight=7900`.
3. Другой compensation не было; anchor был очищен после loader-only роста на 26 px, затем auto-fill добавил вторую страницу.

Это соответствует текущему `useLayoutEffect` в `ChatView.tsx`: изменение `loading` и любой рост `scrollHeight` считаются достаточными для compensation/очистки, хотя loading indicator может увеличить высоту без новых сообщений. Task 5B требует failing regression именно для этой последовательности и сохраняет rejected/no-op/room-switch cleanup. Product code в Task 6 не менялся.

Artifacts:

- `metrics/task-6-pagination.json`, `traces/task-6-pagination.trace.json.gz`.
- `metrics/task-6-pagination-second.json`, `traces/task-6-pagination-second.trace.json.gz`.
- `metrics/task-6-pagination-scroll-calls.json` — только non-secret geometry/timing/call observations.
- Для сравнения: `metrics/task-5A-pagination-anchor.json`, `traces/task-5A-pagination-anchor.trace.json.gz`.

## 7. Решения по virtualization и code splitting

### Виртуализация — не добавлять в MVP

На 1000 rendered messages final typing завершился без Long Tasks, final value совпал, max per-character probe duration был 30.800 ms; 30 scroll steps и 20 room switches также завершились без Long Tasks. Эти профили не воспроизводят отдельный blocker, который виртуализация должна устранять. Full-history bulk load остаётся ограничением с Long Tasks, но его отличающиеся стартовые состояния не образуют failing user-scenario benchmark для виртуализации. Менять DOM/scroll model дополнительно до исправления подтверждённого pagination blocker было бы спекулятивной оптимизацией с риском для anchoring.

### Дополнительный code splitting — не добавлять в MVP

Main JS encoded body изменился с 350943 до 351228 B, а total cold transferred bytes увеличились на 312 B; warm total не изменился. WASM составляет `7826886 B` encoded body и уже загружается отдельным chunk. Chunk-size warning сам по себе не является воспроизводимым blocker, а startup profiles не показывают отказ критичного сценария, который можно было бы приписать отсутствию дополнительного splitting. Поэтому новых dynamic imports/chunking changes нет.

### Обязательный follow-up

Остаётся только подтверждённый pagination release blocker. Его owning files, failing test, browser PASS criteria и команды записаны в **Task 5B** плана. До его RED→GREEN и повторного browser benchmark нельзя считать pagination/performance decision gate закрытым.

## 8. Caveats

- Все browser comparisons — по одному primary run на сценарий, без статистической значимости; второй pagination run использован для воспроизводимости дефекта.
- Preview cache policy не заменяет проверку production Caddy headers в Task 8.
- Production React hook предоставляет commit counts, но не Profiler durations.
- Full-history starting counts различаются; агрегаты этого сценария не используются для заявления улучшения.
- Секреты, session JSON и сообщения не включены в документацию; raw traces сохранены только в gitignored SDD workspace.
