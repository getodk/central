#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

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
if [[ "${ENKETO_SECRETS-}" = "danger-insecure" ]]; then
  log "Skipping secrets check."
else
  log "Checking secrets exist..."
  assert_size /etc/secrets/enketo-secret       64
  assert_size /etc/secrets/enketo-less-secret  32
  assert_size /etc/secrets/enketo-api-key     128
fi

CONFIG_PATH=${ENKETO_SRC_DIR}/config/config.json
log "Generating enketo configuration..."

BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
SECRET=$(cat /etc/secrets/enketo-secret) \
LESS_SECRET=$(cat /etc/secrets/enketo-less-secret) \
API_KEY=$(cat /etc/secrets/enketo-api-key) \
/scripts/envsub.awk \
    < "$CONFIG_PATH.template" \
    > "$CONFIG_PATH"

log "Starting enketo..."
exec yarn workspace enketo-express start
