# Code Splitting (Vendor Chunks + Lazy Routes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить production bundle на vendor-chunks (matrix-js-sdk, react) и сделать страницы ленивыми, убрав предупреждение Vite >500 kB и не загружая код чатов на /auth.

**Architecture:** Только конфиг Vite (`codeSplitting.groups`) + `React.lazy` для страниц с `Suspense` в `MainLayout`. Инициализация Matrix/крипто/сессий не меняется.

**Tech Stack:** Vite 8.2.2 (rolldown), React 19, react-router-dom 7, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-code-splitting-design.md`

## Global Constraints

- Работа в worktree `.worktrees/mvp-stabilization`, ветка `feat/text-mvp-stabilization`.
- НЕ менять `src/shared/lib/matrix/*` (client, crypto, session, lifecycle).
- НЕ добавлять зависимости.
- `manualChunks` НЕ использовать (deprecated в rolldown) — только `build.rolldownOptions.output.codeSplitting`.
- `LoginPage` остаётся статическим импортом.
- Коммиты на русском/английском в стиле существующих (`perf:`, `build:`).

## Review Focus

- Циклические зависимости vendor-chunks: matrix-chunk может импортировать react-vendor и наоборот — проверить, что production build не падает и страницы рендерятся (Task 3 smoke).
- `SettingsStubPage` используется 3 раза с разными `title` — lazy-обёртка одна, props пробрасываются как раньше (Task 2).
- Suspense fallback не должен мигать при каждой навигации между уже загруженными роутами — React кэширует lazy после первого резолва, проверить в smoke (Task 3).
- Тесты `MainLayout.test.tsx` мокают matrix-слой — lazy страницы в тестах MainLayout не рендерятся (роуты-тесты используют свои element), регрессий быть не должно; если упадут — чинить тест, а не откатывать lazy (Task 2, Step 4).

---

### Task 1: Vendor chunks через Vite codeSplitting

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Produces: отдельные chunks `matrix-*.js`, `react-vendor-*.js` в `dist/assets`.

- [ ] **Step 1: Зафиксировать baseline размеров**

Run: `pnpm build 2>&1 | tail -20 && ls -l dist/assets/*.js | awk '{print $5, $9}'`
Expected: один большой `index-*.js` ~1.1-1.2 МБ; записать размеры в заметку для Task 3.

- [ ] **Step 2: Настроить codeSplitting в `vite.config.ts`**

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'matrix', test: /node_modules[\\/]matrix-js-sdk[\\/]/ },
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
})
```

- [ ] **Step 3: Проверить сборку**

Run: `pnpm build 2>&1 | tail -25 && ls -l dist/assets/*.js | awk '{print $5, $9}'`
Expected: PASS; отдельные `matrix-*.js` и `react-vendor-*.js`; app `index-*.js` заметно меньше baseline. Если предупреждение >500 kB осталось только на matrix-chunk — зафиксировать, не дробить дальше в этой задаче.

- [ ] **Step 4: Прогнать тесты и lint**

Run: `pnpm test && pnpm lint`
Expected: все PASS (конфиг не влияет на Vitest, но проверка обязательна).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "build: split matrix and react vendor chunks"
```

### Task 2: Lazy routes + Suspense в MainLayout

**Files:**
- Modify: `src/app/router/app-router.tsx`
- Modify: `src/app/ui/MainLayout.tsx`
- Test: `src/app/ui/MainLayout.test.tsx` (существующие тесты должны проходить без изменений)

**Interfaces:**
- Consumes: ничего из Task 1 (независимы по коду, но коммитим поверх).
- Produces: `ChatsPage`, `ContactsPage`, `CallsPage`, `GeneralSettingsPage`, `SettingsStubPage` — lazy; `LoginPage` статический.

- [ ] **Step 1: Заменить импорты страниц на lazy в `app-router.tsx`**

```tsx
import { lazy } from 'react'
// LoginPage, AuthLayout, MainLayout, AuthGuard — статические, как раньше
const ChatsPage = lazy(() => import('../../pages/ChatsPage'))
const ContactsPage = lazy(() => import('../../pages/ContactsPage'))
const CallsPage = lazy(() => import('../../pages/CallsPage'))
const GeneralSettingsPage = lazy(() => import('../../pages/GeneralSettingsPage'))
const SettingsStubPage = lazy(() => import('../../pages/SettingsStubPage'))
```

JSX роутов не меняется (все страницы имеют default export; `SettingsStubPage` по-прежнему получает `title`).

- [ ] **Step 2: Обернуть `<Outlet/>` в Suspense в `MainLayout.tsx`**

В ветке `client ready` заменить `<Outlet />` на:

```tsx
<Suspense fallback={<p>Загрузка…</p>}>
    <Outlet />
</Suspense>
```

`Suspense` импортировать из `react`. Другие ветки (loading/error) не трогать.

- [ ] **Step 3: Проверить типы и сборку**

Run: `pnpm build 2>&1 | tail -25 && ls -l dist/assets/*.js | awk '{print $5, $9}'`
Expected: PASS; отдельные chunks на страницу (`ChatsPage-*.js`, `GeneralSettingsPage-*.js` и т.д.); entry не содержит код чатов.

- [ ] **Step 4: Прогнать тесты и lint**

Run: `pnpm test && pnpm lint`
Expected: 32/32 файла PASS, включая `MainLayout.test.tsx` и `ConnectionStatus.test.tsx`. Если тест падает из-за async lazy-рендера — обернуть ожидание в `waitFor`/`findBy*` в тесте, lazy не откатывать.

- [ ] **Step 5: Commit**

```bash
git add src/app/router/app-router.tsx src/app/ui/MainLayout.tsx
git commit -m "perf: lazy-load route pages with Suspense in MainLayout"
```

### Task 3: Верификация и документирование эффекта

**Files:**
- Create: `docs/mvp/code-splitting.md`

**Interfaces:**
- Consumes: результаты сборок Task 1 и Task 2.

- [ ] **Step 1: Финальные автоматические проверки**

Run: `pnpm test && pnpm lint && pnpm build && git diff --check`
Expected: всё PASS.

- [ ] **Step 2: Production smoke**

Run: `VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org VITE_MATRIX_SERVER_NAME=capsachat.org pnpm build && pnpm preview`
Открыть preview в браузере (chrome-devtools tool): `/auth` рендерится, в консоли нет ошибок chunk loading; навигация `/auth` → после логина (если есть saved session — restore) → `/chats`, `/settings/general` — без ошибок, fallback не висит. Network: отдельные запросы `matrix-*.js`, `react-vendor-*.js`, page-chunks подгружаются при навигации.
Expected: все роуты работают, console чистая.

- [ ] **Step 3: Записать сравнение в `docs/mvp/code-splitting.md`**

Таблица: имя chunk, raw bytes до (из Task 1 Step 1) и после; отметка о предупреждении >500 kB (ушло/осталось и на каком chunk); результат smoke. Указать, что WASM и подход C (ленивая инициализация SDK) вне scope.

- [ ] **Step 4: Commit**

```bash
git add docs/mvp/code-splitting.md docs/superpowers/specs/2026-11-04-code-splitting-design.md docs/superpowers/plans/2026-11-04-code-splitting.md
git commit -m "docs: record code splitting results"
```
