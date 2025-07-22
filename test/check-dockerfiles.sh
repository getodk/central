#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

for dockerfile in $(git ls-files \*.dockerfile); do
  log "Checking $dockerfile ..."
  docker build --file "$dockerfile" --check .
done

log "All OK."
