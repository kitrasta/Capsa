# Text MVP: production release validation

- Дата: **2026-11-03**
- Финальный статус: **DONE_WITH_CONCERNS — current-code production release активен**
- Final application commit: `c25b8c7237a69a2105636225ddf88cb95a231d74`
- Current-code releases: `20261103T102025Z-c25b8c7` и `20261103T104816Z-c25b8c7` (byte-identical)
- **Final active release:** `20261103T104816Z-c25b8c7`
- Initial evidence release: `20261103T092607Z-fa250c8` (pre-8A, сохранён, не считается previous UI)

## Final rerun: automatic checks

На чистом `c25b8c7` выполнено:

```bash
pnpm test && pnpm lint && pnpm build && git diff --check
```

- Node `v24.15.0`, pnpm `12.16.1`.
- Vitest: **32/32 files, 203/203 tests PASS**, duration `4.39s`.
- ESLint и TypeScript + Vite build: PASS, `2164 modules`, `451ms`.
- `git diff --check`: PASS.
- Production builds обоих deploy: PASS, `422ms` и `434ms`; оба содержат `index-Bp1cCRju.js`.
- Сохранилось только известное предупреждение Vite о chunks больше 500 kB.

## Final rerun: Caddy activation и persistence

1. Первый current-code release опубликован до Caddy activation, как требует обновлённый runbook.
2. Создан backup `/srv/capsa/caddy/Caddyfile.backup.20261103T102040Z`.
3. Candidate прошёл `caddy validate`; после `install` выполнен `docker compose up -d --force-recreate caddy`.
4. В новом container `cmp` подтвердил совпадение bind-mounted Caddyfile с candidate; `/srv/capsa-web/current/index.html` readable.
5. Отдельный persistence gate повторно force-recreated **только Caddy**, повторно прошёл `cmp`/root checks и HTTP/Matrix checks.

Synapse и PostgreSQL оставались running; их конфигурация и lifecycle не менялись. Compose лишь проверял dependency health при recreate Caddy.

## Final rerun: HTTP и Matrix

| Проверка | Результат |
|---|---|
| HTTPS `/` | PASS, exact 200 |
| Прямой `/chats/health-check` | PASS, exact 200 |
| `/index.html` | PASS, `Cache-Control: no-cache` |
| `/assets/index-Bp1cCRju.js` | PASS, `Cache-Control: public, max-age=31536000, immutable` |
| WASM | PASS, `Content-Type: application/wasm`; browser GET 200 |
| Matrix client discovery | PASS, `https://matrix.capsachat.org` |
| Matrix server discovery | PASS, `matrix.capsachat.org:443` |
| Matrix client versions | PASS, 200 |
| Все основные HTTP/Matrix gates после persistence recreate | PASS |
| `/`, nested route и current asset после обоих switch directions | PASS |

## Final rerun: browser smoke

Использованы saved synthetic sessions из Task 1 **и** новые dedicated test-only accounts/devices для password login и recovery. Созданы только synthetic rooms/messages/profile/account-data/key-backup fixtures; server configuration и реальные пользовательские данные не использовались. Secrets хранились только в mode-0600 gitignored materials и не включены в документацию.

| Сценарий | Финальный результат |
|---|---|
| Password login | PASS на dedicated A/B и clean E2EE account; начальный 429 B обработан ожиданием advertised retry-after, затем PASS |
| Session restore + nested-route refresh | PASS на saved и dedicated sessions |
| Encrypted DM creation через UI | PASS, lock indicator и 2 участника |
| DM send/receive A ↔ B | PASS в обоих направлениях |
| Group creation/search/membership | PASS; group имеет 2 участника |
| Group live receive | PASS |
| Draft restore после reload и последующий send | PASS |
| Reply + MXID fallback + preview | PASS |
| Edit, включая reply event | PASS, `изм.` сохраняется после reload |
| Reaction add/render | PASS, включая mobile touch action |
| Unread → open/read | PASS: badge `1` очищается |
| Read state после reload | PASS, badge остаётся очищенным |
| Visible at-bottom live receive | PASS, message rendered без unread badge |
| Read-marker local-ID/404 regression | PASS: `Failed to mark room as read` и read-marker 404 отсутствуют |
| Offline → reconnect | PASS: banner появился offline, исчез online, следующий encrypted send PASS |
| E2EE/recovery | PASS: recovery key accepted, encrypted history readable, recovery gate не вернулся после reload |
| Encrypted live send | PASS до и после reconnect |
| Mobile 390×844, DPR 2, mobile/touch | PASS: нет horizontal overflow, composer/back control видимы, touch menu/reaction PASS |
| Final post-switch smoke | PASS: group, edited reply, read state, encrypted history, sessions и mobile restore |

Clean recovery flow сообщил `Готово. Восстановлено ключей: 0`; это значение не переинтерпретируется как nonzero import. При этом recovery завершился, preloaded encrypted history была readable, а persisted recovery и новые encrypted sends прошли.

## Final rerun: две версии и rollback

- Первый current-code release: `20261103T102025Z-c25b8c7`.
- Второй current-code release: `20261103T104816Z-c25b8c7`.
- `diff -qr` между release directories: без различий; production asset names совпадают.
- После второго deploy `current` указывал на второй release.
- `scripts/rollback-web.sh 20261103T102025Z-c25b8c7`: PASS; HTTP и asset checks PASS.
- `scripts/rollback-web.sh 20261103T104816Z-c25b8c7`: PASS; final `/`, nested route и asset checks PASS.
- **Final `current`: `releases/20261103T104816Z-c25b8c7`.**
- Initial `20261103T092607Z-fa250c8` не удалён и не использовался как валидный previous UI.

## Performance comparison reference

Новый статистический production performance benchmark не выполнялся. Метод и сравнения сохранены в:

- `docs/mvp/baseline.md` — исходные startup/interaction metrics;
- `docs/mvp/performance.md` — Task 6 comparison и прежний stale-anchor defect;
- Task 5B evidence — 88→128 messages, одна page, immediate/settled anchor delta `0px`, extra pages `0`.

Task 8 валидирует delivery, cache/WASM, functionality, release switching и persistence, но не заявляет нового performance улучшения.

## Final known concerns

1. Saved Task 1 device IDs в свежих crypto stores по-прежнему вызывают repeated one-time-key HTTP 400. Dedicated fresh devices и clean E2EE/recovery прошли; отдельный follow-up нужен для saved-device reuse после очистки site data.
2. Recovery UI сообщил zero imported keys; successful recovery/persistence и readable encrypted history подтверждены, но nonzero backup import отдельно не заявлен.
3. Offline emulation и начальный login 429 создали ожидаемые console network errors; optional Matrix endpoints также дали non-blocking 404 resource logs.
4. Большой main/WASM chunk остаётся известным предупреждением; новых performance measurements нет.

Открытых release blockers в финальном rerun не осталось. GitHub push не выполнялся.

---

## Historical record: initial BLOCKED rollout

- Initial application/release commit: `fa250c8ef15148620dcc7955c970044cb25a24db`
- Initial release ID: `20261103T092607Z-fa250c8`
- Initial status: **BLOCKED**, pre-release Caddy state был восстановлен

Это первая попытка versioned web release. Предыдущего UI release не существовало. Второй release и переключение между IDs не выполнялись после обнаружения release blocker; несуществующий прежний UI не выдумывался.

## 1. Final local checks

Выполнено на чистом `fa250c8`:

```bash
pnpm test && pnpm lint && pnpm build && git diff --check
```

Результаты:

- Node `v24.15.0`, pnpm `12.16.1`.
- Vitest: **31/31 files, 191/191 tests PASS**.
- ESLint: PASS.
- TypeScript + Vite production build: PASS, `2164 modules`, `467ms`.
- `git diff --check`: PASS.
- Сохранилось известное предупреждение Vite о chunks больше 500 kB; новых ошибок нет.

`scripts/deploy-web.sh` затем повторно выполнил production-configured build: PASS, `559ms`, главный asset `index-BrfveelH.js`.

## 2. Caddy и публикация

- До rollout remote `/srv/capsa/web/releases` и `current` отсутствовали.
- Создан backup: `/srv/capsa/caddy/Caddyfile.backup.20261103T010621Z`.
- Candidate `deploy/Caddyfile` прошёл `caddy validate`; Synapse и PostgreSQL не перезапускались и не перенастраивались.
- `scripts/deploy-web.sh` создал `20261103T092607Z-fa250c8` и атомарно установил `current -> releases/20261103T092607Z-fa250c8`.

### Обнаруженный deployment defect

Первый `/` health check вернул **404**. Rollout был остановлен, backup восстановлен; Matrix client/discovery остались HTTP 200. Повторная проверка показала:

- release files и `current/index.html` существовали и были доступны внутри Caddy container;
- documented `install` заменяет host inode, тогда как `/etc/caddy/Caddyfile` — single-file bind mount;
- container продолжал читать прежний inode, поэтому оба reload возвращали `config is unchanged` и сохраняли старый root.

Для временной проверки candidate был повторно validated и загружен напрямую из in-container `/tmp/capsa-Caddyfile.new`. Caddy записал `autosaved config` и `load complete`; HTTP checks ниже после этого прошли. После обнаружения отдельного read-state blocker pre-release Caddy state снова восстановлен.

Требуется отдельный regression fix release runbook: bind-mount-safe update/recreate, проверка активного `/srv/capsa-web/current`, restart/recreate persistence и обязательный `/` health gate. Текущий documented `install`+reload нельзя считать исправленным.

## 3. Production HTTP checks до финального restore

| Проверка | Результат |
|---|---|
| HTTPS `https://web.capsachat.org/` | PASS, 200 после direct candidate reload |
| Прямой `/chats/health-check` SPA fallback | PASS, 200 |
| `/index.html` | PASS, `Cache-Control: no-cache` |
| `/assets/index-BrfveelH.js` | PASS, `Cache-Control: public, max-age=31536000, immutable` |
| `matrix_sdk_crypto_wasm_bg-D1uUpLo2.wasm` | PASS, `Content-Type: application/wasm`; browser GET 200 |
| `https://capsachat.org/.well-known/matrix/client` | PASS, сохранён `https://matrix.capsachat.org` |
| `https://capsachat.org/.well-known/matrix/server` | PASS, сохранён `matrix.capsachat.org:443` |
| `/_matrix/client/versions` | PASS, 200 |

Эти результаты относятся к временно активному candidate до restore, а не к текущему состоянию web origin.

## 4. Browser smoke matrix

Использованы только два saved synthetic account/session из Task 1 и exchange room с синтетическими сообщениями. Browser contexts были изолированы; реальные пользовательские данные не использовались. Пароли, access tokens, recovery keys и session JSON не выводились и не коммитились.

| Сценарий | Результат |
|---|---|
| Unauthenticated `/` → `/auth`, login form | PASS |
| Password login | NOT RUN: Task 1 сохранил sessions, но не passwords |
| Saved session restore | PASS на A и B |
| Прямой nested-route refresh + session restore | PASS |
| DM/history на двух участниках | PASS |
| A send, B receive и B → A live receive | PASS |
| Draft сохраняется после reload, затем отправляется | PASS |
| Reply с preview и корректным MXID fallback | PASS на A/B |
| Edit с маркером `изм.` | PASS на A/B |
| Reaction add/render | PASS на A/B |
| Unread badge для новых сообщений | PASS |
| Read marker очищает unread badge | **FAIL — release blocker** |
| Group creation/group smoke | NOT RUN после stop condition |
| Reconnect banner/recovery sync | NOT RUN после stop condition |
| Recovery key/verification flow | NOT RUN: saved materials не содержат recovery key |
| Mobile layout/touch actions | NOT RUN после stop condition |

### Read-state blocker

- B имел unread badge `3`, открыл room и получил HTTP 200 на `POST .../read_markers`.
- Badge остался `3` после 15 секунд, последующих sync responses и полного nested-route reload.
- A получил новое сообщение B в открытой комнате; badge увеличился до `5` и остался.
- После optimistic send A также наблюдался read-marker HTTP 404: в request попал local transaction-style event ID, которого ещё нет на сервере.

Нужны failing-first integration/browser regressions для server event ID, обновления room-list unread state и visible at-bottom live receive. Нельзя скрывать badge или отключать unread counts как workaround.

### Дополнительные observations, не заменяющие blocker

- IndexedDB initialization выдал warning и fallback на `MemoryStore` (`IndexedDBStore.startup` вызван до назначения store клиенту).
- Повторное использование saved device ID в свежем browser crypto store вызвало one-time-key HTTP 400 у A; secret-storage endpoints вернули 404. Поэтому полноценное E2EE/recovery recovery этим smoke не подтверждено.
- WASM успешно загружен; указанные crypto observations задокументированы без ключей или секретного материала.

## 5. Performance comparison reference

Новый production performance benchmark в Task 8 не запускался. Сравнительная база остаётся:

- `docs/mvp/baseline.md`: исходные startup/interaction metrics и pagination blocker;
- `docs/mvp/performance.md`: Task 6 comparison и воспроизведение stale-anchor defect;
- Task 5B evidence: final pagination probe **88→128 messages**, одна page, immediate/settled anchor delta **0px**, extra pages **0**.

Task 8 подтверждает только production delivery/cache/WASM checks и не заявляет нового статистического performance улучшения.

## 6. Rollback и финальное состояние

- После первого Caddy 404 backup был восстановлен; после диагностики candidate временно активирован только для проверок.
- Read-state blocker остановил rollout до создания второго release и до production `rollback-web.sh` verification.
- Финально pre-release Caddyfile восстановлен из backup и загружен в running Caddy.
- Immutable release `20261103T092607Z-fa250c8` сохранён как evidence; `current` указывает на него, но pre-release Caddy root этот symlink не обслуживает.
- Web `/` вернулся к исходному **404**; Matrix client API и оба discovery endpoints — **200**.
- Второй release не создан, previous UI не сфабрикован, GitHub push не выполнялся.

## 7. Known limitations / follow-ups

1. **Release blocker:** unread badges не очищаются корректно; local-echo read marker может дать 404.
2. **Release-process blocker:** documented Caddy `install` несовместим с текущим single-file bind mount; требуется исправление и restart/recreate regression.
3. Password login, recovery key verification, group, reconnect и mobile smoke остаются непроверенными из-за сохранённых materials и stop condition.
4. IndexedDB fallback и crypto key-upload observations требуют отдельной проверки после read-state fix.
5. Большой main/WASM chunk — известное performance ограничение; см. baseline/performance docs.

Production release не считается успешным до устранения blockers и повторного полного Task 8, включая второй release, switching/rollback и final smoke.
