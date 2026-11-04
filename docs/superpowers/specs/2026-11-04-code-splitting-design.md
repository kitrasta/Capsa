# Design: Code Splitting (Vendor Chunks + Lazy Routes)

Дата: 2026-11-04
Статус: draft для реализации
Parent: follow-up #3 из `docs/mvp/release-validation.md` (большой main/WASM chunk)

## Intent и why

Production bundle сейчас: один `index-*.js` ~1.2 МБ raw / ~349 КБ gzip (app + matrix-js-sdk + React + router), WASM 7.8 МБ грузится отдельно при crypto init и вне scope. Vite предупреждает о chunk >500 kB. Цель — разделить vendor и app код (лучшее кэширование, параллельная загрузка, исчезновение предупреждения) и не грузить код страниц чатов/настроек на экране логина. Измеряемый baseline есть в `docs/mvp/baseline.md`.

## Goals

- `matrix-js-sdk`, React/ReactDOM/React Router в отдельных vendor-chunks через Vite config.
- Страницы (`ChatsPage`, `ContactsPage`, `CallsPage`, `GeneralSettingsPage`, `SettingsStubPage`) — `React.lazy` + `Suspense` внутри `MainLayout`.
- `pnpm test`, `pnpm lint`, `pnpm build` — PASS; предупреждение >500 kB уходит (или фиксируется остаток).
- Сравнение размеров до/после записано в документацию.

## Non-goals / Anti-goals

- НЕ менять инициализацию Matrix SDK / крипто / сессии (подход C — отдельная задача).
- НЕ трогать WASM-бандл и crypto init.
- НЕ добавлять новые зависимости.
- НЕ гнаться за «мгновенным /auth»: SDK остаётся в стартовом пути через `LoginPage`/`AuthGuard` — это известное ограничение A+B.

## Constraints

- Vite 8.2.2 (rolldown-vite): нативный chunk splitting — `build.rolldownOptions.output.codeSplitting.groups` с `{ name, test: /regex/ }` (подтверждено по типам `rolldown@1.2.6`). Устаревший `manualChunks` НЕ использовать.
- React 19, react-router-dom 7: `React.lazy` + `Suspense`.
- Дефолтные экспорты у всех страниц уже есть.
- Роуты `/chats`, `/chats/:roomId`, `/contacts`, `/calls`, `/settings/*` — внутри `MainLayout`; `Suspense` fallback ставится в `MainLayout` вокруг `<Outlet/>`, чтобы Sidebar/ConnectionStatus не мигали при навигации.

## Approaches (выбрано: A + B)

- **A. Vendor splitting** — `manualChunks`: `matrix` (matrix-js-sdk), `react-vendor` (react, react-dom, react-router-dom). Минимальный риск, только конфиг.
- **B. Route lazy loading** — `React.lazy` страниц + `Suspense` в `MainLayout`. Убирает код чатов/настроек из стартового пути /auth.
- **C. Ленивая загрузка matrix-слоя** — отклонено в этом scope: задевает singleton-клиент, session restore, AuthGuard; отдельная задача.

## How (решённые части)

- `vite.config.ts`: `build.rolldownOptions.output.codeSplitting.groups`: `{ name: 'matrix', test: /node_modules[\\/]matrix-js-sdk/ }`, `{ name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ }`.
- `src/app/router/app-router.tsx`: статические импорты страниц заменить на `const ChatsPage = lazy(() => import('../../pages/ChatsPage'))` и т.д. `LoginPage` остаётся статическим.
- `src/app/ui/MainLayout.tsx`: обернуть `<Outlet/>` в `<Suspense fallback={...}>`; fallback — минимальный центрированный спиннер (переиспользовать существующий `Loader2` из lucide-react, как в GeneralSettingsPage) или `null`, если в проекте нет паттерна — выбор: простой div с текстом «Загрузка…» в существующих стилях, без новых зависимостей.
- Тесты: существующие тесты `MainLayout.test.tsx` должны проходить; lazy-импорты в Vitest (jsdom) резолвятся нативно. Добавить smoke-тест роутера: рендер lazy-роута через `Suspense` показывает fallback, затем контент — только если существующая тестовая инфраструктура это покрывает без новых моков; иначе ограничиться прохождением существующих тестов.

## Оставлено исполнителю

- Разбиение `lucide-react`, `dompurify` — только если останутся >500 kB после A.
- Форма fallback-спиннера в рамках существующих стилей.

## Verification

- `pnpm test && pnpm lint && pnpm build` PASS.
- `dist/assets`: перечень chunks и размеры (raw) до/после — записать в `docs/mvp/performance.md` или новый `docs/mvp/code-splitting.md`.
- Smoke: production build + `vite preview`, вручную/через browser tool: /auth рендерится, логин→/chats работает, навигация по роутам без ошибок в консоли.
