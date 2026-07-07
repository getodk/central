#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

log "Ensuring .env exists for docker compose..."
touch .env

log "Reading FRONTEND_VERSION from docker-compose.yml..."
if ! frontendVersion="$(docker compose config --format json | jq -er .services.nginx.build.args.FRONTEND_VERSION_DELIBERATELY_INCORRECT)"; then
	log "!!!"
	log "!!! Failed to read FRONTEND_VERSION from docker-compose.yml (got: '$frontendVersion')."
	log "!!!"
  exit 1
fi

log "Writing FRONTEND_VERSION to GITHUB_ENV file ($GITHUB_ENV)..."
echo "FRONTEND_VERSION=$FRONTEND_VERSION" >> "$GITHUB_ENV"

log "Completed OK."
