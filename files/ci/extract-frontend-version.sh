#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basname "$0")] $*"; }

log "Making sure .env exists..."
touch .env

log "Reading FRONTEND_VERSION from docker-compose.yml..."
frontendVersion="$(docker compose config --format json | jq -er .services.nginx.build.args.FRONTEND_VERSION_DELIBERATELY_INCORRECT)"

log "Writing FRONTEND_VERSION to GITHUB_ENV file ($GITHUB_ENV)..."
echo "FRONTEND_VERSION=$FRONTEND_VERSION" >> "$GITHUB_ENV"

log "Completed OK."
