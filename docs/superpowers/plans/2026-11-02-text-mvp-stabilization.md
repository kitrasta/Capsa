# Capsa Text MVP Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести существующий текстовый клиент до стабильного MVP, измерить и устранить подтверждённые проблемы производительности и опубликовать его на `web.capsachat.org` с возможностью отката.

**Architecture:** Сохраняем React/CSS Modules и существующий Matrix-слой без глобального рефакторинга. Исправления выполняются через регрессионные тесты; оптимизации — после baseline. Production-артефакт остаётся статическим SPA и публикуется versioned-release каталогами за существующим Caddy.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest, Testing Library, `matrix-js-sdk`, Docker Compose, Caddy, SSH/rsync.

**Spec:** `docs/superpowers/specs/2026-11-02-text-mvp-stabilization-design.md`

## Global Constraints

- MVP работает только с `https://matrix.capsachat.org`; server name — `capsachat.org`.
- Не добавлять вложения, звонки, message search, push-уведомления, arbitrary homeservers или публичную регистрацию.
- Не менять React, Matrix SDK, feature-oriented архитектуру и не вводить state-manager без отдельного согласования.
- Не копировать код Cinny и не использовать моки вместо production smoke tests.
- Не коммитить `.env`, пароли, access tokens, recovery keys или реальную переписку.
- Сохранить Matrix discovery, Synapse/PostgreSQL и существующие HTTPS-маршруты.
- Production остаётся статическим SPA без service worker/PWA и SSR.
- Каждое исправление дефекта сначала получает failing regression test; оптимизация требует сравнения «до/после».

## Review Focus

- **Reply fallback с display name вместо MXID:** fallback обязан содержать настоящий sender MXID; Task 2 закрепляет цепочку `MessageView.senderId → ReplyDraft.senderId → ReplyTarget.senderId` и отдельно проверяет legacy draft без MXID.
- **Правка сообщения, которое само является ответом:** связь `m.in_reply_to` должна сохраняться, а сообщение должно быть доступно для правки; Task 2 покрывает оба условия.
- **Rejected send при активном ответе:** текст и reply draft должны вернуться в composer; Task 4 проверяет это через `ChatView`, а не только через mock API.
- **Sync Error/Reconnecting:** пользователь должен видеть восстановление соединения, а после Prepared/Syncing — скрытый индикатор; Task 3 проверяет оба перехода и отписку.
- **Mixed release assets:** переключение release должно быть атомарным, с предыдущим release для rollback; Task 7 проверяет скрипты, Task 8 — fallback, cache headers и rollback на production.

## File Map

- `docs/mvp/baseline.md` — исходные проверки, тестовый набор, профили и список подтверждённых blockers.
- `docs/mvp/performance.md` — сравнение производительности и размеров до/после.
- `docs/mvp/release-validation.md` — production smoke, release ID, ограничения и rollback.
- `src/shared/lib/matrix/api/messages.ts` и его тест — Matrix reply/edit семантика.
- `src/widgets/Chat/messageView.ts`, `useRoomDraft.ts`, `ChatView.tsx` и их тесты — MXID ответа, legacy drafts и доступность правки ответов.
- `src/app/ui/ConnectionStatus.tsx`, `.module.css`, `.test.tsx` — индикатор восстановления соединения.
- `src/widgets/Chat/__tests__/ChatView.test.tsx` — сохранение composer state при ошибках.
- `src/widgets/Chat/hooks/useTimelineItems.ts` и тест — мемоизация derived timeline.
- `src/widgets/Chat/hooks/useAutoLoadHistory.ts`, `src/widgets/Chat/ChatView.tsx` и `src/widgets/Chat/__tests__/ChatView.test.tsx` — сохранение scroll anchor при пагинации без лишней автозагрузки.
- `scripts/deploy-web.sh`, `scripts/rollback-web.sh`, `deploy/Caddyfile`, `docs/deployment.md` — воспроизводимый release/rollback.

---

### Task 1: Baseline и воспроизводимый набор проверок

**Files:**
- Create: `docs/mvp/baseline.md`
- Reference: `package.json`, `vite.config.ts`, `src/widgets/Chat/ChatView.tsx`, `src/widgets/Sidebar/RoomList/RoomList.tsx`

**Interfaces:**
- Produces: зафиксированные версии Node/pnpm, commit SHA, результаты команд, asset sizes, тестовый набор и профили для Task 6.

- [ ] **Step 1: Зафиксировать исходные автоматические проверки**

Run: `node --version && pnpm --version && git rev-parse HEAD && pnpm test && pnpm lint && pnpm build`
Expected: текущие 174 tests PASS, lint/build PASS; записать фактические значения без округления и предупреждение о chunk size.

- [ ] **Step 2: Запустить production build и подготовить тестовые данные**

Запустить `pnpm preview` против production-сборки. Использовать только тестовые аккаунты: не менее 100 комнат для списка и отдельную комнату с не менее чем 1000 текстовых событий. Пароли/tokens в документ не записывать.

- [ ] **Step 3: Снять browser baseline**

В актуальном Chrome записать холодный/тёплый запуск, открытие cached room, 20 переключений комнат, непрерывный ввод, получение сообщения, прокрутку и pagination. Сохранить размеры transferred assets, Long Tasks и React Profiler observations; указать устройство, viewport и условия сети.

- [ ] **Step 4: Записать только подтверждённые blockers**

В `docs/mvp/baseline.md` для каждого блокера указать reproduction, ожидаемое/фактическое поведение, owning file и regression test. Если найден blocker вне Tasks 2–5, сначала добавить к этому плану отдельную TDD-задачу с точными файлами и командами; не расширять функциональность MVP.

- [ ] **Step 5: Commit**

```bash
git add docs/mvp/baseline.md docs/superpowers/plans/2026-11-02-text-mvp-stabilization.md
git commit -m "docs: record MVP performance baseline"
```

### Task 2: Корректная Matrix-семантика ответов и правок

**Files:**
- Modify: `src/shared/lib/matrix/api/messages.ts`
- Test: `src/shared/lib/matrix/__tests__/messages.test.ts`
- Modify: `src/widgets/Chat/messageView.ts`
- Modify: `src/widgets/Chat/hooks/useRoomDraft.ts`
- Modify: `src/widgets/Chat/ChatView.tsx`
- Test: `src/widgets/Chat/__tests__/MessageBubble.test.tsx`
- Test: `src/widgets/Chat/hooks/__tests__/useRoomDraft.test.tsx`

**Interfaces:**
- Consumes: существующие `ReplyTarget`, `buildReplyContent(target, text)`, `toMessageView(event, room, myUserId)`.
- Produces: `MessageView.senderId: string`, `ReplyDraft.senderId: string`, `ReplyTarget.senderId: string`; `MessageView.canEdit === true` для собственного текстового ответа, но не для replace/annotation events.

- [ ] **Step 1: Написать failing regression tests**

В `messages.test.ts` передать `ReplyTarget` с `senderId: '@alice:capsachat.org'` и display name, отличающимся от MXID, в UI-fixtures; проверить fallback `> <@alice:capsachat.org>`. В `MessageBubble.test.tsx` проверить `MessageView.senderId`, `canEdit === true` для own `m.text` с reply relation и `false` для `rel_type: 'm.replace'`/`'m.annotation'`. В `useRoomDraft.test.tsx` проверить, что legacy reply draft без `senderId` отбрасывается, а текстовый черновик сохраняется.

- [ ] **Step 2: Подтвердить падение**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/messages.test.ts src/widgets/Chat/__tests__/MessageBubble.test.tsx src/widgets/Chat/hooks/__tests__/useRoomDraft.test.tsx`
Expected: FAIL на отсутствующем `senderId` и/или `canEdit === false` для ответа.

- [ ] **Step 3: Внести минимальное исправление**

Добавить `senderId` в `MessageView` и `ReplyDraft`; переименовать `ReplyTarget.sender` в `senderId` и использовать его в `buildReplyContent`. В `ChatView` заполнять `senderId` из `MessageView`, сохраняя `senderName` только для отображения. Валидация stored reply draft обязана требовать `senderId`, не удаляя сохранённый текст. В `toMessageView` разрешить reply relation при `canEdit`, продолжая исключить replace/annotation и чужие/non-text/redacted события.

- [ ] **Step 4: Проверить исправление и отсутствие регрессий**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/messages.test.ts src/widgets/Chat/__tests__/MessageBubble.test.tsx src/widgets/Chat/hooks/__tests__/useRoomDraft.test.tsx src/widgets/Chat/__tests__/timelineItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/matrix/api/messages.ts src/shared/lib/matrix/__tests__/messages.test.ts src/widgets/Chat/messageView.ts src/widgets/Chat/hooks/useRoomDraft.ts src/widgets/Chat/ChatView.tsx src/widgets/Chat/__tests__/MessageBubble.test.tsx src/widgets/Chat/hooks/__tests__/useRoomDraft.test.tsx
git commit -m "fix: preserve Matrix reply and edit semantics"
```

### Task 3: Видимое восстановление Matrix-соединения

**Files:**
- Create: `src/app/ui/ConnectionStatus.tsx`
- Create: `src/app/ui/ConnectionStatus.module.css`
- Test: `src/app/ui/ConnectionStatus.test.tsx`
- Modify: `src/app/ui/MainLayout.tsx`

**Interfaces:**
- Consumes: готовый singleton из `getClient()`, `ClientEvent.Sync`, `SyncState`.
- Produces: `<ConnectionStatus />` без props; показывает `role="status"` только для `SyncState.Error` и `SyncState.Reconnecting`.

- [ ] **Step 1: Написать failing component test**

Замокать Matrix client с `getSyncState()` и `on/off`. Проверить последовательность `Error → status visible`, `Reconnecting → visible`, `Prepared → null`, `Syncing → null`; после unmount проверить удаление ровно того listener, который был добавлен.

- [ ] **Step 2: Подтвердить падение**

Run: `pnpm vitest run src/app/ui/ConnectionStatus.test.tsx`
Expected: FAIL, потому что компонент отсутствует.

- [ ] **Step 3: Реализовать компонент и подключить только после client ready**

В `ConnectionStatus` хранить текущий `SyncState`, подписаться на `ClientEvent.Sync` в effect и корректно отписаться. Для Error/Reconnecting вывести `Нет соединения. Пытаемся восстановить…`; в остальных состояниях вернуть `null`. Добавить ненавязчивый banner в `MainLayout` внутри ветки `client ready`, не перекрывая composer и EncryptionRecoveryGate.

- [ ] **Step 4: Проверить тесты layout и соединения**

Run: `pnpm vitest run src/app/ui/ConnectionStatus.test.tsx src/app/ui/MainLayout.test.tsx`
Expected: PASS; MainLayout не вызывает `getClient()` до готовности клиента.

- [ ] **Step 5: Commit**

```bash
git add src/app/ui/ConnectionStatus.tsx src/app/ui/ConnectionStatus.module.css src/app/ui/ConnectionStatus.test.tsx src/app/ui/MainLayout.tsx
git commit -m "feat: show Matrix reconnection status"
```

### Task 4: Регрессионные тесты composer при сбоях отправки

**Files:**
- Create: `src/widgets/Chat/__tests__/ChatView.test.tsx`
- Reference: `src/widgets/Chat/ChatView.tsx`, `src/widgets/Chat/hooks/useRoomDraft.ts`

**Interfaces:**
- Consumes: существующие `useMessageSend()`, `useRoomDraft()`, `ChatView({ roomId })`.
- Produces: проверенный контракт восстановления text/reply/edit drafts без изменения публичных типов.

- [ ] **Step 1: Написать integration regression tests**

Замокать timeline/scroll/history/read hooks, оставив реальный composer. Для rejected `send` проверить восстановление введённого текста и активного reply draft; для rejected `edit` — текст и edit draft. Отдельно проверить, что успешный submit очищает соответствующий draft и IME composition не вызывает submit.

- [ ] **Step 2: Запустить тесты и исправить только подтверждённый дефект**

Run: `pnpm vitest run src/widgets/Chat/__tests__/ChatView.test.tsx`
Expected: существующее поведение PASS. Если тест выявляет дефект, сначала зафиксировать FAIL, затем минимально исправить `ChatView.tsx` и повторить команду до PASS; никаких новых функций.

- [ ] **Step 3: Commit**

```bash
git add src/widgets/Chat/__tests__/ChatView.test.tsx src/widgets/Chat/ChatView.tsx
git commit -m "test: preserve composer drafts after send failures"
```

### Task 5: Не пересчитывать таймлайн при вводе текста

**Files:**
- Create: `src/widgets/Chat/hooks/useTimelineItems.ts`
- Test: `src/widgets/Chat/hooks/__tests__/useTimelineItems.test.tsx`
- Modify: `src/widgets/Chat/ChatView.tsx`
- Reference: `src/widgets/Chat/timelineItems.ts`

**Interfaces:**
- Consumes: `toTimelineItems(messages, room, myUserId)`.
- Produces: `useTimelineItems(messages: MatrixEvent[], room: Room | null | undefined, myUserId: string | null): TimelineItem[]`; результат стабилен по ссылке, пока входы не изменились.

- [ ] **Step 1: Написать failing hook test**

Через `renderHook` проверить: повторный render с теми же `messages`, `room`, `myUserId` возвращает ту же ссылку и не вызывает повторный `toTimelineItems`; новый массив messages создаёт новый результат.

- [ ] **Step 2: Подтвердить падение**

Run: `pnpm vitest run src/widgets/Chat/hooks/__tests__/useTimelineItems.test.tsx`
Expected: FAIL, потому что hook отсутствует.

- [ ] **Step 3: Реализовать memoization и использовать её в ChatView**

В hook один раз вычислять `toTimelineItems` через `useMemo` по `[messages, room, myUserId]`. В `ChatView` вызвать hook до условного `if (!room)` и заменить inline-вызов в JSX на его результат; typing/focus/reply/edit state не должны пересчитывать всю ленту.

- [ ] **Step 4: Проверить тесты и измерить локальный эффект**

Run: `pnpm vitest run src/widgets/Chat/hooks/__tests__/useTimelineItems.test.tsx src/widgets/Chat/__tests__/ChatView.test.tsx src/widgets/Chat/__tests__/timelineItems.test.ts && pnpm build`
Expected: PASS; в production profile повторного ввода отсутствует прежний derived-timeline Long Task. Записать наблюдение для Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/Chat/hooks/useTimelineItems.ts src/widgets/Chat/hooks/__tests__/useTimelineItems.test.tsx src/widgets/Chat/ChatView.tsx
git commit -m "perf: memoize derived chat timeline"
```

### Task 5A: Сохранять scroll anchor при пагинации

**Files:**
- Modify: `src/widgets/Chat/ChatView.tsx`
- Modify: `src/widgets/Chat/hooks/useAutoLoadHistory.ts`
- Test: `src/widgets/Chat/__tests__/ChatView.test.tsx`

**Interfaces:**
- Consumes: baseline blocker `pagination-anchor-verified`, существующие `useAutoLoadHistory()` и scroll-anchor compensation из `ChatView`.
- Produces: одна ручная пагинация сохраняет viewport offset первого видимого события; автозагрузка не добавляет вторую страницу с `keepPosition=false`, пока восстанавливается anchor.

- [ ] **Step 1: Написать failing regression test**

В `ChatView.test.tsx` смоделировать scroll container и две доступные страницы истории. После ручного scroll к верху разрешить завершиться первой `scrollback`, оставив `scrollTop` у верхней границы до применения compensation. Проверить, что не выполняется вторая автоматическая `scrollback` с потерей позиции и что viewport offset исходного первого сообщения сохраняется после prepend.

- [ ] **Step 2: Подтвердить падение**

Run: `pnpm vitest run src/widgets/Chat/__tests__/ChatView.test.tsx`
Expected: FAIL из-за повторной автозагрузки и/или смещения anchor, воспроизводящие baseline `anchorPixelDelta=1822px`.

- [ ] **Step 3: Внести минимальное исправление**

Сделать восстановление scroll anchor мгновенным, а не smooth-анимацией, и не запускать auto-fill с `keepPosition=false`, пока compensation не завершена. Не отключать автозаполнение действительно короткой ленты и не менять Matrix API или размер страницы.

- [ ] **Step 4: Проверить регрессию и browser scenario**

Run: `pnpm vitest run src/widgets/Chat/__tests__/ChatView.test.tsx && pnpm build`
Expected: PASS. Повторить `pagination-anchor` из Task 1 на тех же данных: первая видимая строка сохраняет offset, `anchorPixelDelta=0px` после стабилизации, лишней страницы нет; записать наблюдение для Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/Chat/ChatView.tsx src/widgets/Chat/hooks/useAutoLoadHistory.ts src/widgets/Chat/__tests__/ChatView.test.tsx
git commit -m "fix: preserve pagination scroll anchor"
```

### Task 6: Проверить производительность и закрыть decision gates

**Files:**
- Create: `docs/mvp/performance.md`
- Reference: `docs/mvp/baseline.md`, production build, browser profiles

**Interfaces:**
- Consumes: baseline и изменения Tasks 5 и 5A.
- Produces: доказанное решение, достаточно ли текущей оптимизации; точные follow-up tasks для любого оставшегося blocker.

- [ ] **Step 1: Повторить baseline на идентичных данных и условиях**

Run: `pnpm test && pnpm lint && pnpm build`, затем повторить browser-сценарии из Task 1.
Expected: все команды PASS; записать transferred bytes, Long Tasks и поведение scroll/pagination/20 room switches.

- [ ] **Step 2: Принять решение по виртуализации и code splitting**

Если воспроизводимый blocker остаётся, до нового кода добавить в план отдельную задачу с failing test/benchmark, точными файлами и критерием PASS. Виртуализацию или дополнительный code splitting внедрять только при таком подтверждённом blocker; иначе явно записать отказ от них для MVP.

- [ ] **Step 3: Записать сравнение**

В `docs/mvp/performance.md` перенести baseline/final значения, условия измерений, исправленные hotspots, оставшиеся ограничения и причины решений. Не заявлять улучшение без профиля.

- [ ] **Step 4: Commit**

```bash
git add docs/mvp/performance.md docs/superpowers/plans/2026-11-02-text-mvp-stabilization.md
git commit -m "docs: record MVP performance validation"
```

### Task 7: Воспроизводимые release и rollback

**Files:**
- Create: `scripts/deploy-web.sh`
- Create: `scripts/rollback-web.sh`
- Create: `deploy/Caddyfile`
- Create: `docs/deployment.md`
- Modify: `.gitignore` только если появляется новый локальный secret/config файл

**Interfaces:**
- Consumes: `dist/`, production env, SSH target в `CAPSA_DEPLOY_TARGET`, remote root `/srv/capsa/web`.
- Produces: releases в `/srv/capsa/web/releases/<release-id>`, атомарный symlink `/srv/capsa/web/current`; rollback принимает существующий release ID.

- [ ] **Step 1: Задать release-контракт в скриптах**

`deploy-web.sh` должен использовать `set -euo pipefail`, требовать `CAPSA_DEPLOY_TARGET`, собирать с точными production env, создавать release ID из UTC timestamp + short Git SHA, загружать `dist/` через rsync в новый каталог и переключать `current` через temporary symlink + atomic rename. Не удалять предыдущий release автоматически.

`rollback-web.sh` должен требовать target и release ID, проверять существование каталога, атомарно переключать `current` и ничего не удалять. Секреты и локальные пути в скрипты не вшивать.

- [ ] **Step 2: Зафиксировать Caddy и инструкции**

В `deploy/Caddyfile` сохранить существующие `capsachat.org` и `matrix.capsachat.org`, а для `web.capsachat.org` использовать root `/srv/capsa-web/current`, SPA fallback и текущие cache headers. В `docs/deployment.md` описать одноразовое обновление Caddy с backup/validate/reload, deploy, rollback, health checks и требование SSH/rsync.

- [ ] **Step 3: Проверить скрипты и production build**

Run: `bash -n scripts/deploy-web.sh scripts/rollback-web.sh && VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org VITE_MATRIX_SERVER_NAME=capsachat.org pnpm build`
Expected: syntax PASS, build PASS; в `dist` нет `.env` или secrets.

- [ ] **Step 4: Проверить Caddy config без смены production**

Загрузить только `deploy/Caddyfile` во временный remote path и выполнить `caddy validate --adapter caddyfile` в существующем Caddy container. Expected: `Valid configuration`; production symlink и running config пока не переключать.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy-web.sh scripts/rollback-web.sh deploy/Caddyfile docs/deployment.md .gitignore
git commit -m "build: add atomic web deployment and rollback"
```

### Task 8: Production release, smoke test и отчёт

**Files:**
- Create: `docs/mvp/release-validation.md`
- Modify: `README.md`
- Reference: `docs/deployment.md`, `docs/mvp/baseline.md`, `docs/mvp/performance.md`

**Interfaces:**
- Consumes: release scripts из Task 7 и зелёные проверки Tasks 1–6.
- Produces: опубликованный release ID, проверенный rollback и список известных MVP-ограничений.

- [ ] **Step 1: Выполнить финальные локальные проверки**

Run: `pnpm test && pnpm lint && pnpm build && git diff --check`
Expected: все команды PASS; рабочее дерево содержит только запланированные изменения.

- [ ] **Step 2: Опубликовать через документированный механизм**

Сделать backup текущего remote Caddyfile, применить проверенный config, validate/reload Caddy, затем запустить `scripts/deploy-web.sh`. Сохранить release ID. Synapse/PostgreSQL не перезапускать и не перенастраивать.

- [ ] **Step 3: Проверить HTTP и production browser smoke**

Проверить HTTPS, `/`, прямой `/chats/:roomId`, `index.html: no-cache`, hashed assets: immutable, WASM MIME/load и Matrix discovery. Двумя тестовыми аккаунтами проверить login/session restore, DM/group, send/receive, reply/edit/reaction, unread/read, drafts, reconnect и E2EE/recovery. Проверить mobile layout и отсутствие secrets в logs.

- [ ] **Step 4: Проверить rollback и вернуть новый release**

Если предыдущий release существует, запустить `scripts/rollback-web.sh` на него, проверить прежний UI и вернуть новый release ID. При первом деплое создать второй release из того же проверенного `dist`, проверить переключение между двумя ID и оставить итоговый release; не выдумывать несуществующий прежний UI. Повторить базовый smoke. Любой release blocker требует остановить rollout и добавить regression task, а не скрыть проблему в отчёте.

- [ ] **Step 5: Обновить документацию и закоммитить результат**

В README привести реализованные функции/roadmap в соответствие с кодом. В `release-validation.md` записать дату, commit/release ID, команды и результаты, performance comparison, production checks, rollback и известные ограничения без секретов.

```bash
git add README.md docs/mvp/release-validation.md
git commit -m "docs: validate text MVP production release"
```
