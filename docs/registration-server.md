# Регистрация Capsa: Synapse и Resend

## Схема

Регистрация выполняется стандартным Matrix API без отдельного backend:

```text
Capsa /auth → Synapse → Resend SMTP → email пользователя
```

- Homeserver API: `https://matrix.capsachat.org`.
- Matrix server name: `capsachat.org`.
- Регистрация открыта для всех, но требует UIA-стадии `m.login.email.identity`.
- Отправитель: `Capsa <no-reply@mail.capsachat.org>`.
- Домен `mail.capsachat.org` добавлен и подтверждён в Resend; DNS-записи находятся в Cloudflare.

## Конфигурация Synapse

Файл на VPS: `/srv/capsa/synapse/homeserver.yaml`.

Действующие параметры:

```yaml
public_baseurl: "https://matrix.capsachat.org/"
enable_registration: true
registrations_require_3pid:
  - email

email:
  smtp_host: smtp.resend.com
  smtp_port: 465
  smtp_user: resend
  smtp_pass: <RESEND_API_KEY>
  require_transport_security: true
  notif_from: "Capsa <no-reply@mail.capsachat.org>"
  app_name: Capsa
```

API key является паролем SMTP. Он должен существовать только в защищённой серверной конфигурации. Не добавляйте его в Git, браузерный код или переменные `VITE_*`: Vite включает такие переменные в публичный bundle.

Для перенастройки оператор временно помещает `RESEND_API_KEY` в локальный gitignored `.env`. Файл передаётся на VPS через SSH/SFTP/SCP без вывода содержимого в команду или журнал, а временная серверная копия удаляется после применения конфигурации.

## Backup и применение

Перед изменением создать timestamped backup с сохранением прав:

```bash
cp -a /srv/capsa/synapse/homeserver.yaml \
  /srv/capsa/synapse/homeserver.yaml.backup.registration.$(date -u +%Y%m%dT%H%M%SZ)
```

После изменения проверить YAML, затем пересоздать только Synapse:

```bash
cd /srv/capsa
docker compose exec -T synapse python -c \
  "import yaml; yaml.safe_load(open('/data/homeserver.yaml')); print('YAML OK')"
docker compose up -d --force-recreate synapse
```

PostgreSQL и Caddy этой процедурой не меняются.

## Health checks

```bash
docker compose --project-directory /srv/capsa -f /srv/capsa/compose.yaml ps synapse
curl -fsS https://matrix.capsachat.org/_matrix/client/versions >/dev/null
curl -fsS https://capsachat.org/.well-known/matrix/client
curl -fsS https://capsachat.org/.well-known/matrix/server
```

Один пустой запрос без создания аккаунта:

```bash
curl -sS -X POST -H 'Content-Type: application/json' \
  --data '{}' https://matrix.capsachat.org/_matrix/client/v3/register
```

Ожидается HTTP 401 с UIA flow `m.login.email.identity`. Ответ `Registration has been disabled` означает, что регистрация всё ещё выключена. Не сохраняйте UIA session из ответа в отчёты.

## Rollback

Подставьте фактический backup, созданный перед изменением:

```bash
cd /srv/capsa
backup=/srv/capsa/synapse/homeserver.yaml.backup.registration.<timestamp>
cp -a "$backup" /srv/capsa/synapse/homeserver.yaml
docker compose up -d --force-recreate synapse
```

Затем повторите health checks и проверьте вход существующего аккаунта. После успешной настройки или rollback удалите временные credentials/scripts с VPS.

## Изменение 2026-11-05

Backup перед включением:  
`/srv/capsa/synapse/homeserver.yaml.backup.registration.20261104T230314Z` (UTC в имени файла).

После запуска Synapse 1.164.1 API и оба discovery endpoint отвечали успешно; регистрация вернула ожидаемый email UIA flow. Фактическая доставка письма и полный клиентский сценарий проверяются отдельно в release validation.
