#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

log "Building docker image..."
docker compose build --no-cache enketo
#docker compose build enketo

log "Starting container..."
set +e
timeout --foreground 10 docker compose run --rm --no-deps enketo
exitCode="$?"
set -e

if [[ "$exitCode" = 124 ]]; then
  log "!!! Enketo startup did not fail, despite invalid config."
  exit 1
else
  log "Enketo exited _correctly_ with code: $exitCode"
  # TODO assert specific exit code?
fi

log "Everything looks OK."
