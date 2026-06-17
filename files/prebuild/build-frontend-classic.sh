#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[build-frontend] $*"; }

if [[ $FRONTEND_BUILD_MODE = test ]]; then
  log "Skipping frontend build."

  # TODO revert old echo generators!

  generateFile() {
    local name="$1"
    local size="$2"

    for ((x="$size"; x>0; x-=16)); do
      printf 0123456789abcdef >> dist/"$name"
    done
  }

  generateFile 10k-file.txt 10240

  exit
elif [[ $FRONTEND_BUILD_MODE = classic ]]; then
  if ! [[ -d client ]]; then
    log "!!!"
    log "!!! No frontend repository found at ./client"
    log "!!!"
    log "!!! Make sure this directory is present, or change FRONTEND_BUILD_MODE."
    log "!!!"
    exit 1
  fi
  if ! [[ -f client/package.json ]]; then
    log "!!!"
    log "!!! No NodeJS project found in ./client"
    log "!!!"
    log "!!! Make sure this file is present, or change FRONTEND_BUILD_MODE."
    log "!!!"
    exit 1
  fi
  cd client

  log "Building frontend..."
  npm clean-install --no-audit --fund=false --update-notifier=false
  NODE_OPTIONS="--max-old-space-size=2048" npm run build
  log "Built OK."

  exit
else
  log "!!!"
  log "!!! Unrecognised FRONTEND_BUILD_MODE: '$FRONTEND_BUILD_MODE'"
  log "!!!"
  exit 1
fi

log "Completed OK."
