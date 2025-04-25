#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

log "Building docker image..."
docker compose --file ./test/enketo.test.docker-compose.yml build --no-cache enketo

log "Starting container..."
set +e
timeout --foreground 10 docker compose run --rm --no-deps enketo
exitCode="$?"
set -e

if [[ "$exitCode" = 124 ]]; then
  log "!!! Enketo startup did not fail, despite invalid config."
  exit 1
elif [[ "$exitCode" = 1 ]]; then
  log "Enketo exited correctly."
else
  log "Enketo exited with unexpected status: $exitCode"
  exit 1
fi

log "Everything looks OK."
