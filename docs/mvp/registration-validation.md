# Проверка регистрации и federated login

Дата: 2026-11-05  
Source commit: `f90baa4`  
Production release: `20261104T234940Z-f90baa4`  
Production URL: `https://web.capsachat.org/auth`

## Автоматические проверки

- Vitest: 75 files, **489/489 tests passed** (включая существующий worktree stabilization при запуске из общего корня).
- `pnpm lint`: PASS.
- `pnpm build`: PASS; существующее предупреждение о большом Matrix chunk не является новой ошибкой.
- Независимый read-only review ветки: четыре Important findings исправлены с RED→GREEN regressions; Critical findings не было.

## Реальный Matrix/Resend сценарий

На локальной production-сборке против `https://matrix.capsachat.org`:

1. Создан тестовый аккаунт `@capsa-test-20261105-0206:capsachat.org`.
2. До подтверждения клиент оставался на `/auth`; после отправки показывал «Проверьте почту».
3. Письмо через Resend доставлено; после подтверждения открытая вкладка автоматически перешла в чаты.
4. Повторное открытие `/auth` восстановило сессию и перешло в чаты.
5. В сохранённой сессии проверены `homeserverUrl=https://matrix.capsachat.org` и `serverName=capsachat.org`; значение token в отчёт не копировалось.
6. Повторный `register/email/requestToken` вернул HTTP 200 с валидным sid; sid в отчёт не копировался.
7. Полный Matrix ID на `matrix.org` вошёл в чаты; после reload сохранились `https://matrix-client.matrix.org` и `matrix.org`.
8. Короткий логин тестового аккаунта Capsa выполнил вход успешно.
9. Для существующего зашифрованного аккаунта клиент показал штатный recovery flow.

Пароли, access tokens, Resend API key, UIA session/client secret, sid и recovery keys в этот отчёт не включены.

## Сервер

- Synapse запущен с обязательным `m.login.email.identity` для регистрации.
- Resend SMTP работает на `smtp.resend.com:465` с `force_tls: true`.
- Начальная проблема зависшего `requestToken` воспроизведена, связана с отсутствием implicit TLS и исправлена; после этого письмо доставлено.
- Backup исходной конфигурации: `/srv/capsa/synapse/homeserver.yaml.backup.registration.20261104T230314Z`.
- Дополнительный backup перед TLS fix создан с префиксом `homeserver.yaml.backup.smtp.*`.
- Временные credentials и setup-script с VPS удалены.

## Production health

Проверено после атомарного deploy:

- HTTPS `/` и nested SPA route: HTTP 200.
- `index.html`: `Cache-Control: no-cache`.
- Hashed JS asset: immutable cache policy.
- WASM: `Content-Type: application/wasm`.
- Оба Matrix well-known endpoint и `/_matrix/client/versions`: PASS.
- Production `/auth`: вкладки «Вход / Регистрация» и поля регистрации отображаются.

## Ограничения проверки

- После review fixes не создавался второй ненужный реальный аккаунт; изменённые happy-path участки покрыты UIA/component tests.
- Реальный rate limit и занятые username/email в production специально не провоцировались; классификация проверена реальными SDK error instances в unit tests.
- Визуальная проверка на нескольких устройствах/браузерах и полный screen-reader audit не проводились.
- IPv6-based Matrix IDs не проверялись; известный deferred minor касается `getDomain()` в space `via`, а не входа/регистрации.
