# Registration and Federated Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public email-verified registration on `capsachat.org` and password login through other Matrix homeservers from the same `/auth` page.

**Architecture:** Keep accounts in Synapse and use Matrix UIA with `matrix-js-sdk`; no Capsa backend. Resolve full Matrix IDs through `AutoDiscovery`, persist the selected homeserver in the session, and render login/registration as tabs on `/auth`. Configure Synapse to send verification mail through Resend SMTP.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, matrix-js-sdk 42, Synapse, Resend SMTP, existing Docker Compose/Caddy deployment.

**Spec:** `docs/superpowers/specs/2026-11-05-registration-and-federated-login-design.md`

## Global Constraints

- Base the execution branch and worktree on `feat/text-mvp-stabilization` (`108717d`), then cherry-pick design commits `a70d272` and `d7c99dc`; do not implement on the older `main`.
- Registration is open to visitors only on `https://matrix.capsachat.org`; account domain is `capsachat.org`.
- `/auth` contains tabs «Вход / Регистрация»; there is no `/register` route.
- Full Matrix ID login uses standard discovery; short login defaults to `capsachat.org`.
- Email confirmation is mandatory before registration succeeds; use `m.login.email.identity` UIA.
- Resend domain is `mail.capsachat.org`; SMTP sender is `Capsa <no-reply@mail.capsachat.org>`.
- No new backend, account database, SSO, password recovery, captcha, landing page, or unfinished-registration persistence.
- Never print or commit passwords, access tokens, Resend API key, UIA client secret, sid, or recovery keys. No `VITE_RESEND_*` variable.
- Existing sessions must acquire server defaults without logout when their account domain matches the configured Capsa server.
- Every code task follows RED → GREEN and ends with a focused commit; do not change Synapse until client unit tests pass.

## Review Focus

- Malformed IDs and non-SUCCESS discovery must never silently fall back to an unintended server — pinned in Task 1.
- Partial, mismatched, or legacy stored server fields must not reconnect an account to the wrong homeserver — pinned in Task 2.
- Repeated submit/resend/poll and component unmount must not create duplicate accounts or update dead UI — pinned in Tasks 5 and 6.
- Occupied username/email and rate limits need distinct safe messages, not a generic wrong-password error — pinned in Tasks 5 and 6.
- SMTP rollback and secret handling must preserve existing login and keep credentials out of Git/browser/logs — pinned in Tasks 7 and 8.

---

### Task 1: Homeserver resolution and Matrix ID parsing

**Files:**
- Create: `src/shared/lib/matrix/homeserver.ts`
- Create: `src/shared/lib/matrix/__tests__/homeserver.test.ts`
- Modify: `src/shared/lib/matrix/config.ts`

**Interfaces:**
- Consumes: `MATRIX_HOMESERVER_URL`, `MATRIX_SERVER_NAME`, `AutoDiscovery.findClientConfig`.
- Produces:
  ```ts
  interface HomeserverConnection { homeserverUrl: string; serverName: string }
  interface LoginTarget extends HomeserverConnection { identifier: string }
  function getCapsaHomeserver(): HomeserverConnection
  function discoverHomeserver(serverName: string): Promise<HomeserverConnection>
  function resolveLoginTarget(input: string): Promise<LoginTarget>
  ```
- `HomeserverDiscoveryError extends Error` marks unusable discovery results.

- [ ] **Step 1: Write failing resolution tests**

Cover: trimmed short `alice` returns configured Capsa URL/domain and identifier `alice`; `@alice:matrix.org` returns identifier unchanged plus discovered `https://matrix-client.matrix.org`; blank/malformed input rejects; `SUCCESS` without valid `base_url`, `PROMPT`, `FAIL_PROMPT`, and `FAIL_ERROR` reject with `HomeserverDiscoveryError` and never return the configured Capsa URL.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/homeserver.test.ts`  
Expected: FAIL because `../homeserver` does not exist.

- [ ] **Step 3: Implement resolution**

Use trimmed input and the configured Capsa values for short names. For a full Matrix ID, extract everything after the localpart separator as server name and call `AutoDiscovery.findClientConfig`. Accept only `AutoDiscoveryAction.SUCCESS` and a non-empty validated `base_url`; normalize trailing slashes. Add a `requireServerName()` config guard analogous to `requireHomeserverUrl()`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/homeserver.test.ts src/shared/lib/matrix/__tests__/config.test.ts`  
Expected: PASS, including the existing config tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/matrix/homeserver.ts src/shared/lib/matrix/config.ts src/shared/lib/matrix/__tests__/homeserver.test.ts src/shared/lib/matrix/__tests__/config.test.ts
git commit -m "feat: resolve Matrix login homeservers"
```

### Task 2: Server-aware persisted sessions

**Files:**
- Modify: `src/shared/lib/matrix/session.ts`
- Modify: `src/shared/lib/matrix/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `getCapsaHomeserver()` or the dependency-free config defaults.
- Produces: `MatrixSession` with required `homeserverUrl: string` and `serverName: string`; `saveSession`, `getSession`, and `clearSession` include `capsa.matrix.homeserverUrl` and `capsa.matrix.serverName`.

- [ ] **Step 1: Extend tests and verify they fail**

Update valid session fixtures with Capsa server fields. Add assertions that: new sessions round-trip both fields; legacy three-field `capsa.matrix.*` and oldest `matrix_*` sessions acquire configured defaults; clearSession removes all six new keys; missing/invalid server fields clear only the new session; a stored `serverName` inconsistent with `userId` is rejected rather than routed elsewhere.

- [ ] **Step 2: Run session tests to verify RED**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/session.test.ts`  
Expected: FAIL because server fields are neither validated nor persisted.

- [ ] **Step 3: Implement compatible session migration**

Keep existing migration/failure semantics. Fill missing server fields only for legacy sessions whose Matrix ID domain matches configured `MATRIX_SERVER_NAME`; validate URL/server strings on new saves. Persist server keys only after complete validation and roll back partial writes as the current migration does.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/session.test.ts`  
Expected: PASS, including storage read/write failure cases.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/matrix/session.ts src/shared/lib/matrix/__tests__/session.test.ts
git commit -m "feat: persist homeserver with Matrix session"
```

### Task 3: Use the selected server throughout the client

**Files:**
- Modify: `src/shared/lib/matrix/client.ts`
- Modify: `src/shared/lib/matrix/lifecycle.ts`
- Modify: `src/shared/lib/matrix/api/spaces.ts`
- Create: `src/shared/lib/matrix/__tests__/client.test.ts`
- Modify: `src/shared/lib/matrix/__tests__/lifecycle.test.ts`
- Modify: `src/shared/lib/matrix/__tests__/spaces.test.ts`

**Interfaces:**
- Consumes: `LoginTarget` and server-aware `MatrixSession`.
- Produces: `loginUser(target: LoginTarget, password: string): Promise<MatrixLoginResponse>`; `initClient(session)` uses `session.homeserverUrl`; space `via` uses `getClient().getDomain()`.

- [ ] **Step 1: Write failing client/lifecycle/space tests**

Assert `loginUser(target, password)` creates its temporary client with `target.homeserverUrl` and sends `target.identifier`; `initClient` uses the session URL while preserving the OTK logger and crypto callbacks from the base branch; identical credentials on a different `homeserverUrl` reinitialize lifecycle; `addRoomToSpace` sends `via: ['example.org']` from the current client domain.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/client.test.ts src/shared/lib/matrix/__tests__/lifecycle.test.ts src/shared/lib/matrix/__tests__/spaces.test.ts`  
Expected: FAIL on dynamic server expectations.

- [ ] **Step 3: Implement dynamic server usage**

Change only server selection and signatures. Reuse `validateLoginResponse` for login/registration session responses; do not log response bodies. Remove static `MATRIX_SERVER_NAME` usage from spaces while retaining the existing config exports needed by other code.

- [ ] **Step 4: Run Matrix tests to verify GREEN**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/matrix/client.ts src/shared/lib/matrix/lifecycle.ts src/shared/lib/matrix/api/spaces.ts src/shared/lib/matrix/__tests__
git commit -m "feat: connect Matrix client to selected homeserver"
```

### Task 4: Email registration UIA session

**Files:**
- Create: `src/shared/lib/matrix/registration.ts`
- Create: `src/shared/lib/matrix/__tests__/registration.test.ts`
- Modify: `src/shared/lib/matrix/index.ts`

**Interfaces:**
- Consumes: `InteractiveAuth`, `AuthType.Email`, `RegisterResponse`, Capsa config.
- Produces:
  ```ts
  interface RegistrationInput { username: string; email: string; password: string }
  interface RegistrationEvents {
    onEmailSent(): void
    onBusyChange(busy: boolean): void
  }
  interface RegistrationSession {
    completion: Promise<RegisterResponse>
    poll(): Promise<void>
    resendEmail(): Promise<void>
  }
  function startEmailRegistration(
    input: RegistrationInput,
    events: RegistrationEvents,
  ): RegistrationSession
  function registrationErrorMessage(error: unknown): string
  ```

- [ ] **Step 1: Write failing UIA tests**

Use a mocked temporary Matrix client with real `InteractiveAuth`. Simulate initial HTTP 401 containing UIA session and email flow, `{sid}` from `requestRegisterEmailToken`, then a successful register response after `poll()`. Assert email is requested once, `onEmailSent` fires only after token success, completion remains pending before confirmation, and the successful request carries the same UIA session. Resend must use send attempt 2 with the same client secret.

- [ ] **Step 2: Add error-classification tests**

Assert distinct messages for `M_USER_IN_USE`, `M_THREEPID_IN_USE`, `M_RATE_LIMITED`, disabled registration (`M_FORBIDDEN`), invalid username, unsupported flow, and network `TypeError`; assert messages do not contain password/token fixtures.

- [ ] **Step 3: Run tests to verify RED**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/registration.test.ts`  
Expected: FAIL because the registration module does not exist.

- [ ] **Step 4: Implement the UIA adapter**

Create the temporary client only with `requireHomeserverUrl()`. In `doRequest`, call `registerRequest` with username, password, optional auth, and `initial_device_display_name: 'Capsa Web'`. Request registration email tokens through `requestRegisterEmailToken`; invoke `onEmailSent` after the request resolves. Expose `attemptAuth()`, `poll()`, and `requestEmailToken()` through the interface above without storing passwords beyond the UIA closure.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `pnpm vitest run src/shared/lib/matrix/__tests__/registration.test.ts src/shared/lib/matrix/__tests__/loginResponse.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/matrix/registration.ts src/shared/lib/matrix/index.ts src/shared/lib/matrix/__tests__/registration.test.ts
git commit -m "feat: add email-verified Matrix registration"
```

### Task 5: Registration form and email-pending state

**Files:**
- Create: `src/widgets/Auth/RegistrationForm.tsx`
- Create: `src/widgets/Auth/RegistrationForm.module.css`
- Create: `src/widgets/Auth/RegistrationForm.test.tsx`

**Interfaces:**
- Consumes: `startEmailRegistration`, `registrationErrorMessage`, `RegistrationSession`.
- Produces: `RegistrationForm({ onRegistered }: { onRegistered(result: RegisterResponse): void })`; polling every 2000 ms and resend cooldown of 30 seconds.

- [ ] **Step 1: Write failing component tests**

Cover required fields/email/password confirmation; successful submit shows «Проверьте почту» only after `onEmailSent`; repeated submit is blocked; resend calls the same session once per cooldown; completion calls `onRegistered`; errors use the safe mapper; unmount clears interval and ignores late completion.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run src/widgets/Auth/RegistrationForm.test.tsx`  
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the form**

Use controlled inputs, one active registration session, and a ref/flag for mounted state. Start polling only in email-pending state; clean up timers on reset/unmount. Provide «Отправить письмо снова» and «Начать заново». Do not persist unfinished UIA state or log form values.

- [ ] **Step 4: Add matching styles**

Reuse existing Capsa color/radius variables and responsive card width. Include disabled/busy, error, notice, and email-pending states; do not introduce a second visual theme.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `pnpm vitest run src/widgets/Auth/RegistrationForm.test.tsx`  
Expected: PASS with fake timers; no act or timer warnings left unresolved.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/Auth
git commit -m "feat: add registration form with email confirmation"
```

### Task 6: Combined `/auth` tabs and session completion

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/LoginPage.module.css`
- Create: `src/pages/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `resolveLoginTarget`, `loginUser`, `RegistrationForm`, `getCapsaHomeserver`, session validation/save.
- Produces: one `/auth` component with local `mode: 'login' | 'register'`; both flows validate the response, save server-aware session, and navigate to `/chats`.

- [ ] **Step 1: Write failing auth-page tests**

Assert both tabs render and switch without changing the route. Mock full-ID resolution and login; assert `@alice:matrix.org` saves the discovered URL/domain and navigates. Assert registration completion saves Capsa connection data. Cover discovery errors separately from wrong password and verify submit remains disabled while pending.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run src/pages/LoginPage.test.tsx`  
Expected: FAIL on tabs and dynamic session data.

- [ ] **Step 3: Implement the combined page**

Keep the existing session-expiry notice. Share one response-to-session completion function between login and registration. Switching tabs clears visible errors and prevents an obsolete login submit from overwriting registration state. Do not add a router entry for registration.

- [ ] **Step 4: Add tab and layout styles**

Match the selected mockup: segmented «Вход / Регистрация» control above the active form, accessible tab roles/states, visible keyboard focus, and mobile-safe layout.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `pnpm vitest run src/pages/LoginPage.test.tsx src/widgets/Auth/RegistrationForm.test.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.module.css src/pages/LoginPage.test.tsx src/widgets/Auth
git commit -m "feat: combine login and registration on auth page"
```

### Task 7: Configure Synapse/Resend and document operations

**Files:**
- Modify on VPS only: `/srv/capsa/synapse/homeserver.yaml`
- Create: `docs/registration-server.md`
- Modify: `README.md`
- Modify locally, never commit: `.env`

**Interfaces:**
- Consumes: verified Resend domain and operator-supplied `RESEND_API_KEY` in local gitignored `.env`.
- Produces: public UIA email registration on Capsa and reproducible backup/rollback instructions.

- [ ] **Step 1: Run the full client regression gate before opening registration**

Run: `pnpm test && pnpm lint && pnpm build`  
Expected: all PASS. Stop on any failure; do not change the server.

- [ ] **Step 2: Obtain the secret without exposing it**

Ask the operator to put `RESEND_API_KEY=<key>` in local `.env`. Upload that file by SFTP to a new root-only temporary credentials path, not `/srv/capsa/.env`; tool calls must contain paths only, never key contents. Set local Matrix values to `https://matrix.capsachat.org` and `capsachat.org`.

- [ ] **Step 3: Back up and patch Synapse**

Create timestamped mode-preserving backup of `homeserver.yaml`. Set `enable_registration: true`, `registrations_require_3pid: [email]`, correct `public_baseurl`, and the exact email block from the spec (`smtp.resend.com:465`, user `resend`, TLS, verified sender). Read the key from the temporary file without echoing it; preserve existing unrelated configuration and file permissions.

- [ ] **Step 4: Restart only Synapse and run health gates**

From `/srv/capsa`, recreate/restart only the Synapse service. Verify container health, `/_matrix/client/versions`, both well-known endpoints, and recent logs without printing secrets. Expected: no startup/SMTP fatal error.

- [ ] **Step 5: Verify registration discovery**

Run an empty `POST /_matrix/client/v3/register` once. Expected: HTTP 401 UIA with `m.login.email.identity`, not `Registration has been disabled`; no account is created.

- [ ] **Step 6: Roll back immediately if any server gate fails**

Restore the timestamped backup, restart only Synapse, and verify versions/discovery/existing password login. Remove temporary credential files after successful configuration or rollback.

- [ ] **Step 7: Document setup and commit docs**

`docs/registration-server.md` records values, secret procedure, health checks, and rollback without real credentials. README lists email registration and full Matrix ID login. `.env.example` documents the two Matrix defaults but does not present Resend secrets as client configuration.

```bash
git add README.md .env.example docs/registration-server.md
git commit -m "docs: configure email registration on Synapse"
```

### Task 8: End-to-end verification, GitHub publication, and deployment

**Files:**
- Create: `docs/mvp/registration-validation.md`
- Use existing: `scripts/deploy-web.sh`, `scripts/rollback-web.sh`, `docs/deployment.md`

**Interfaces:**
- Consumes: all previous tasks, verified Resend SMTP, test email inboxes, operator-entered test passwords.
- Produces: tested branch on GitHub and an atomic production release on `web.capsachat.org`.

- [ ] **Step 1: Run the final static gates**

Run: `pnpm test && pnpm lint && pnpm build`  
Expected: all PASS with no secrets in build output.

- [ ] **Step 2: Verify registration in a browser against production Synapse**

Run the built app locally, open `/auth`, and register a unique test account. Expected: no session before email confirmation; letter arrives from the verified domain; after the operator clicks the link, the pending tab enters chats; reload preserves the session. Test occupied username and resend once.

- [ ] **Step 3: Verify federated and legacy login**

The operator enters credentials personally. Verify `@alice:matrix.org` reaches matrix.org and survives reload; a short Capsa login still works; an existing Capsa account retains E2EE/recovery behavior. Never save passwords in the validation report.

- [ ] **Step 4: Push the working branch to GitHub**

Run: `git push -u origin feat/registration-and-federated-login`  
Expected: remote branch exists with all implementation commits and no local-only result.

- [ ] **Step 5: Deploy atomically**

Run: `CAPSA_DEPLOY_TARGET=root@84.200.128.131 scripts/deploy-web.sh`  
Save the emitted release ID. Do not recreate Caddy or change PostgreSQL; the existing versioned release mechanism is already configured.

- [ ] **Step 6: Run production health checks**

Use `docs/deployment.md`: HTTPS `/`, nested SPA route, no-cache HTML, immutable assets, WASM MIME, both discovery endpoints, and homeserver versions must pass. On failure use `scripts/rollback-web.sh '<previous-release-id>'` and rerun health checks.

- [ ] **Step 7: Smoke-test the deployed `/auth`**

Confirm tabs, Capsa login, full Matrix ID login, and registration pending state on `https://web.capsachat.org/auth`. Do not create a second unnecessary real account if Step 2 already proved the full email cycle.

- [ ] **Step 8: Record verification and push the report**

Record commit SHA, release ID, test results, timestamp, and any limitations in `docs/mvp/registration-validation.md`, excluding credentials/tokens. Commit and push the report.

```bash
git add docs/mvp/registration-validation.md
git commit -m "docs: validate registration and federated login"
git push
```
