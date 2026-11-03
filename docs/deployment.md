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

Выполняется один раз перед первым versioned deploy. Команды создают backup, проверяют именно новый файл в существующем container и только затем заменяют running config и делают reload.

```bash
scp deploy/Caddyfile "$CAPSA_DEPLOY_TARGET:/tmp/capsa-Caddyfile.new"
ssh "$CAPSA_DEPLOY_TARGET" '
  set -eu
  backup="/srv/capsa/caddy/Caddyfile.backup.$(date -u +%Y%m%dT%H%M%SZ)"
  cp /srv/capsa/caddy/Caddyfile "$backup"
  docker cp /tmp/capsa-Caddyfile.new capsa-caddy-1:/tmp/capsa-Caddyfile.new
  docker exec capsa-caddy-1 caddy validate --adapter caddyfile --config /tmp/capsa-Caddyfile.new
  install -m 0644 /tmp/capsa-Caddyfile.new /srv/capsa/caddy/Caddyfile
  docker exec capsa-caddy-1 caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile
  rm -f /tmp/capsa-Caddyfile.new
  docker exec capsa-caddy-1 rm -f /tmp/capsa-Caddyfile.new
  printf "Caddy backup: %s\n" "$backup"
'
```

Если validate завершился с ошибкой, running Caddyfile не заменяется. Не перезапускайте Synapse или PostgreSQL.

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
curl -fsS https://web.capsachat.org/ >/dev/null
curl -fsS https://web.capsachat.org/chats/health-check >/dev/null
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

Затем в браузере проверьте вход, восстановление сессии, sync, отправку и получение сообщения, прямой переход к чату и E2EE/recovery на тестовых аккаунтах. Не записывайте access tokens, пароли или recovery keys в shell history и release-отчёты.
