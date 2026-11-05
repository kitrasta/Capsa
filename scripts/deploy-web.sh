#!/usr/bin/env bash
set -euo pipefail

: "${CAPSA_DEPLOY_TARGET:?Set CAPSA_DEPLOY_TARGET to the SSH deployment target}"

readonly REMOTE_ROOT=/srv/capsa/web

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

VITE_MATRIX_HOMESERVER_URL=https://matrix.capsachat.org \
VITE_MATRIX_SERVER_NAME=capsachat.org \
  pnpm build

release_id="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short HEAD)"
release_dir="$REMOTE_ROOT/releases/$release_id"

ssh "$CAPSA_DEPLOY_TARGET" bash -s -- "$REMOTE_ROOT" "$release_id" <<'REMOTE'
set -euo pipefail
remote_root=$1
release_id=$2
mkdir -p -- "$remote_root/releases"
mkdir -- "$remote_root/releases/$release_id"
REMOTE

rsync -a dist/ "$CAPSA_DEPLOY_TARGET:$release_dir/"

ssh "$CAPSA_DEPLOY_TARGET" bash -s -- "$REMOTE_ROOT" "$release_id" <<'REMOTE'
set -euo pipefail
remote_root=$1
release_id=$2
temporary_link="$remote_root/.current.tmp.$release_id.$$"
ln -s -- "releases/$release_id" "$temporary_link"
mv -Tf -- "$temporary_link" "$remote_root/current"
REMOTE

printf 'Deployed release %s\n' "$release_id"
