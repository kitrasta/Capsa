#!/usr/bin/env bash
set -euo pipefail

: "${CAPSA_DEPLOY_TARGET:?Set CAPSA_DEPLOY_TARGET to the SSH deployment target}"

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <release-id>\n' "${0##*/}" >&2
  exit 64
fi

release_id=$1
case "$release_id" in
  ''|.|..|*[!A-Za-z0-9._-]*)
    printf 'Invalid release ID: %s\n' "$release_id" >&2
    exit 64
    ;;
esac

readonly REMOTE_ROOT=/srv/capsa/web

ssh "$CAPSA_DEPLOY_TARGET" bash -s -- "$REMOTE_ROOT" "$release_id" <<'REMOTE'
set -euo pipefail
remote_root=$1
release_id=$2
release_dir="$remote_root/releases/$release_id"
if [ ! -d "$release_dir" ]; then
  printf 'Release does not exist: %s\n' "$release_id" >&2
  exit 1
fi
temporary_link="$remote_root/.current.tmp.$release_id.$$"
ln -s -- "releases/$release_id" "$temporary_link"
mv -Tf -- "$temporary_link" "$remote_root/current"
REMOTE

printf 'Rolled back to release %s\n' "$release_id"
