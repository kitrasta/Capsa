# Code splitting: vendor chunks + lazy routes

Дата: 2026-11-04
Коммиты: `f58100c` (vendor chunks), `806b875` (lazy routes), `e3a6819` (fix: matrix chunk целиком)
План/спек: `docs/superpowers/plans/2026-11-04-code-splitting.md`, `docs/superpowers/specs/2026-11-04-code-splitting-design.md`

## Что сделано

- **A. Vendor chunks** (`vite.config.ts`, `build.rolldownOptions.output.codeSplitting.groups`):
  - `matrix` — весь `matrix-js-sdk`;
  - `react-vendor` — react, react-dom, react-router(-dom), scheduler.
- **B. Lazy routes** (`app-router.tsx`): `ChatsPage`, `ContactsPage`, `CallsPage`, `GeneralSettingsPage`, `SettingsStubPage` через `React.lazy`; `LoginPage` статический. `Suspense` — в `MainLayout` вокруг `<Outlet/>` (Sidebar/ConnectionStatus не мигуют).

## Размеры production assets (raw bytes)

| Chunk | До (040940f) | После |
|---|---:|---:|
| app `index-*.js` | 1,201,228 | **53,131** |
| `matrix-*.js` | (внутри index) | 1,095,557 |
| `react-vendor-*.js` | (внутри index) | 227,985 |
| `ChatsPage-*.js` | (внутри index) | 46,670 |
| `GeneralSettingsPage-*.js` | (внутри index) | 4,189 |
| `CallsPage` / `ContactsPage` / `SettingsStubPage` | (внутри index) | 172 / 175 / 337 |
| `rust-crypto-*.js` | 226,367 | 226,367 (без изменений) |
| WASM | 7,826,886 | 7,826,886 (вне scope) |

Суммарный JS практически не изменился (~1.63 МБ) — изменилась структура: entry /auth теперь не содержит код страниц чатов/настроек, vendor кэшируется независимо от app-кода.

## Предупреждение >500 kB

**Остаётся** на `matrix` chunk (1.09 МБ). Попытка дробления через `maxSize: 450_000` дала 17 chunks и сняла предупреждение, но **сломала рантайм**: `TypeError: Cannot read properties of undefined (reading 'Override')` на /auth — rolldown разрезал циклически связанные модули SDK (`@types/PushRules.js` ↔ `pushprocessor.js`), enum `PushRuleKind` попал в TDZ. Воспроизведено в `vite preview`, откачено в `e3a6819`. Дробить matrix-js-sdk на части безопасно нельзя — в конфиге оставлен комментарий-предупреждение.

## Верификация

- `pnpm test`: 32/32 файла, 203/203 PASS; `pnpm lint`: PASS; `pnpm build`: PASS; `git diff --check`: PASS.
- Production-configured build (`VITE_MATRIX_HOMESERVER_URL`/`VITE_MATRIX_SERVER_NAME`) + `vite preview`:
  - `/auth` рендерится, консоль чистая;
  - прямые заходы на `/chats` и `/settings/general` без сессии корректно редиректят на `/auth` (AuthGuard);
  - Network: `/auth` загружает только `index`, `matrix`, `react-vendor`, `rolldown-runtime` — page-chunks НЕ запрашиваются;
  - динамический `import()` всех 5 page-chunks в браузере: OK, default export — функция (ровно то, что делает `React.lazy`).
- **Не проверено:** навигация после реального логина (нет сохранённых тестовых сессий локально). Рекомендуется включить в следующий production smoke при деплое.
- После ревью добавлен `LazyRouteErrorBoundary` (`src/shared/ui/LazyRouteErrorBoundary`): rejected lazy-import (новый деплой, старая вкладка, сетевой сбой) показывает recovery UI с кнопкой «Перезагрузить» вместо падения всего приложения. Покрыто 2 тестами (suite 205/205).

## Известные ограничения / follow-ups

- SDK по-прежнему загружается на /auth (его тянут `LoginPage`/`AuthGuard`) — это осознанное ограничение A+B; ленивая инициализация SDK (подход C) — отдельная задача.
- Предупреждение >500 kB остаётся как known limitation вместе с WASM-размером.

## Authenticated smoke (2026-11-04, дополнение)

Production build с `VITE_MATRIX_HOMESERVER_URL=https://matrix.org`, `vite preview` :4175, реальный аккаунт matrix.org (пользователь залогинился и ввёл recovery key самостоятельно):

- Логин → `/chats`: список комнат и зашифрованная история загружены, `ChatsPage-*.js` подгружается отдельным запросом после входа.
- Навигация `/contacts`, `/calls`, `/settings/general`, `/settings/devices`, `/settings/appearance`: каждая страница рендерится, свой chunk запрашивается ровно один раз.
- Открытие зашифрованного чата `/chats/!…:matrix.org`: история расшифрована, composer работает.
- Повторная навигация по уже посещённым роутам: новых script-запросов нет (React кэширует lazy).
- Reload на вложенном роуте `/chats/:roomId`: сессия восстановлена, контент и расшифровка PASS.
- Console errors: только 404 на опциональном `org.matrix.msc4143/rtc/transports` (известный non-blocking, как и в release-validation). Ошибок chunk loading и TDZ нет.
