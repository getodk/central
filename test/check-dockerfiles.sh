#!/bin/bash -eu
set -o pipefail

log() { echo >&2 "[$(basename "$0")] $*"; }

for dockerfile in ./*.dockerfile; do
  log "Checking $dockerfile ..."
  docker build --file "$dockerfile" --check .
done

log "All OK."
