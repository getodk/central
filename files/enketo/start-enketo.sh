#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

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
