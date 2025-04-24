#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

localSecrets="$PWD/temp/secrets"
if [[ -d "$localSecrets" ]]; then
  log "Cleaning local secrets directory.  This may require sudo privileges."
  sudo rm -r "$localSecrets"
  sudo -k # revoke privileges
fi

log "Building secrets image..."
docker compose build --no-cache secrets

log "Running container..."
docker compose run --rm --volume "$localSecrets":/etc/secrets secrets

log "Checking secrets exist..."
assert_size() {
  local f="$1"
  local expectedSize="$2"

  if ! [[ -f "$f" ]]; then
    log "!!! File not found: $f"
    exit 1
  fi

  actualSize="$(stat -c "%s" "$f")"
  if ! [[ "$actualSize" = "$expectedSize" ]]; then
    log "!!!"
    log "!!! Unexpected file size:"
    log "!!!   file: $f"
    log "!!!   expected: $expectedSize b"
    log "!!!   actual:   $actualSize b"
    log "!!!"
    exit 1
  fi
}
assert_size ./temp/secrets/enketo-secret       64
assert_size ./temp/secrets/enketo-less-secret  32
assert_size ./temp/secrets/enketo-api-key     128

log "Everything looks OK."
