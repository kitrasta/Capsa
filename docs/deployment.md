# Деплой web-клиента Capsa

Web-клиент собирается локально как статический SPA и публикуется на существующем VPS с Docker Compose и Caddy. Synapse, PostgreSQL и их конфигурация этой процедурой не меняются.

## Требования и release-контракт

На локальной машине нужны Node.js, pnpm, Git, SSH и `rsync`. SSH-доступ задаётся только через переменную окружения:

```bash
export CAPSA_DEPLOY_TARGET='user@host'
```

У пользователя должны быть права записи в `/srv/capsa/web`; для одноразового обновления Caddy также нужен доступ к Docker на VPS. Секреты, SSH-пароли и ключи в скриптах и репозитории не хранятся.

Сборка всегда использует:

```text
VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org
VITE_MATRIX_SERVER_NAME=capsachat.org
```

`scripts/deploy-web.sh` создаёт ID `<UTC timestamp>-<short Git SHA>`, загружает `dist/` в `/srv/capsa/web/releases/<release-id>` и атомарно переключает `/srv/capsa/web/current` через временный symlink и rename в том же каталоге. Предыдущие releases не удаляются. Каталог `/srv/capsa/web` смонтирован в Caddy как `/srv/capsa-web`, поэтому после одноразовой настройки Caddy публикация и rollback не требуют reload.

## Одноразовое обновление Caddy

Выполняется один раз при первом versioned deploy после публикации release по инструкции ниже, но до HTTP health checks. `/etc/caddy/Caddyfile` — single-file bind mount: `install` заменяет inode на host, а running container продолжает видеть прежний inode. Поэтому reload после install не активирует candidate. Команды ниже создают backup, проверяют candidate, заменяют host-файл и пересоздают только Caddy, затем проверяют активный config и web root внутри нового container.

```bash
scp deploy/Caddyfile "$CAPSA_DEPLOY_TARGET:/tmp/capsa-Caddyfile.new"
ssh "$CAPSA_DEPLOY_TARGET" '
  set -eu
  cd /srv/capsa
  backup="/srv/capsa/caddy/Caddyfile.backup.$(date -u +%Y%m%dT%H%M%SZ)"
  cp /srv/capsa/caddy/Caddyfile "$backup"
  printf "Caddy backup: %s\n" "$backup"
  docker cp /tmp/capsa-Caddyfile.new capsa-caddy-1:/tmp/capsa-Caddyfile.new
  docker exec capsa-caddy-1 caddy validate --adapter caddyfile --config /tmp/capsa-Caddyfile.new
  install -m 0644 /tmp/capsa-Caddyfile.new /srv/capsa/caddy/Caddyfile
  docker compose up -d --force-recreate caddy
  docker cp /tmp/capsa-Caddyfile.new capsa-caddy-1:/tmp/capsa-Caddyfile.new
  docker exec capsa-caddy-1 cmp /tmp/capsa-Caddyfile.new /etc/caddy/Caddyfile
  docker exec capsa-caddy-1 test -r /srv/capsa-web/current/index.html
  rm -f /tmp/capsa-Caddyfile.new
  docker exec capsa-caddy-1 rm -f /tmp/capsa-Caddyfile.new
'
```

`cmp` подтверждает, что новый bind mount содержит именно validated candidate; `test` подтверждает доступность активного root `/srv/capsa-web/current` внутри Caddy. Если validate завершился с ошибкой, running Caddyfile не заменяется. Не перезапускайте Synapse или PostgreSQL.

Если любой шаг после `install`, включая recreate, проверки config/root или последующие HTTP health checks, завершился ошибкой, восстановите напечатанный backup и снова пересоздайте только Caddy. Подставьте фактический путь backup:

```bash
ssh "$CAPSA_DEPLOY_TARGET" '
  set -eu
  cd /srv/capsa
  backup="/srv/capsa/caddy/Caddyfile.backup.<timestamp>"
  install -m 0644 "$backup" /srv/capsa/caddy/Caddyfile
  docker compose up -d --force-recreate caddy
'
curl -fsS https://capsachat.org/.well-known/matrix/client
curl -fsS https://capsachat.org/.well-known/matrix/server
curl -fsS https://matrix.capsachat.org/_matrix/client/versions >/dev/null
```

Только после успешного восстановления и этих Matrix discovery/API gates продолжайте диагностику; не перезапускайте Synapse или PostgreSQL.

## Публикация release

Из корня репозитория:

```bash
CAPSA_DEPLOY_TARGET="$CAPSA_DEPLOY_TARGET" scripts/deploy-web.sh
```

Скрипт сам выполняет production build. Последняя строка вывода содержит опубликованный release ID; сохраните его в release-отчёте. При ошибке до переключения symlink прежний `current` остаётся активным.

Список доступных releases:

```bash
ssh "$CAPSA_DEPLOY_TARGET" 'ls -1 /srv/capsa/web/releases'
```

## Rollback

Выберите существующий ID из списка и выполните:

```bash
CAPSA_DEPLOY_TARGET="$CAPSA_DEPLOY_TARGET" scripts/rollback-web.sh '<release-id>'
```

Rollback проверяет каталог release и атомарно переключает `current`. Он ничего не удаляет и не пересобирает приложение. Для возврата к более новой версии используйте ту же команду с её release ID.

## Health checks

Проверьте HTTPS, SPA fallback и обязательные cache headers:

```bash
test "$(curl -fsS -o /dev/null -w '%{http_code}' https://web.capsachat.org/)" = 200
test "$(curl -fsS -o /dev/null -w '%{http_code}' https://web.capsachat.org/chats/health-check)" = 200
curl -fsSI https://web.capsachat.org/index.html | grep -i '^cache-control: no-cache'
asset_path=$(curl -fsS https://web.capsachat.org/ | grep -o '/assets/[^" ]*\.js' | head -n 1)
test -n "$asset_path"
curl -fsSI "https://web.capsachat.org$asset_path" | grep -i '^cache-control: public, max-age=31536000, immutable'
wasm_file=$(find dist/assets -name '*.wasm' -print -quit)
test -n "$wasm_file"
curl -fsSI "https://web.capsachat.org/assets/$(basename "$wasm_file")" | grep -i '^content-type: application/wasm'
```

Убедитесь, что Matrix discovery и homeserver продолжают отвечать:

```bash
curl -fsS https://capsachat.org/.well-known/matrix/client
curl -fsS https://capsachat.org/.well-known/matrix/server
curl -fsS https://matrix.capsachat.org/_matrix/client/versions >/dev/null
```

### Проверка persistence после recreate

После успешных health checks повторно пересоздайте только Caddy и убедитесь, что candidate и активный root сохраняются, а `/` и nested route снова возвращают HTTP 200. Этот второй recreate является обязательной persistence-проверкой и не заменяет recreate при активации.

```bash
ssh "$CAPSA_DEPLOY_TARGET" '
  set -eu
  cd /srv/capsa
  docker compose up -d --force-recreate caddy
  docker cp /srv/capsa/caddy/Caddyfile capsa-caddy-1:/tmp/capsa-Caddyfile.expected
  docker exec capsa-caddy-1 cmp /tmp/capsa-Caddyfile.expected /etc/caddy/Caddyfile
  docker exec capsa-caddy-1 test -r /srv/capsa-web/current/index.html
  docker exec capsa-caddy-1 rm -f /tmp/capsa-Caddyfile.expected
'
test "$(curl -fsS -o /dev/null -w '%{http_code}' https://web.capsachat.org/)" = 200
test "$(curl -fsS -o /dev/null -w '%{http_code}' https://web.capsachat.org/chats/health-check)" = 200
curl -fsS https://capsachat.org/.well-known/matrix/client
curl -fsS https://capsachat.org/.well-known/matrix/server
curl -fsS https://matrix.capsachat.org/_matrix/client/versions >/dev/null
```

Затем в браузере проверьте вход, восстановление сессии, sync, отправку и получение сообщения, прямой переход к чату и E2EE/recovery на тестовых аккаунтах. Не записывайте access tokens, пароли или recovery keys в shell history и release-отчёты.
