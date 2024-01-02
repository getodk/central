#!/bin/bash -eu
set -o pipefail

flag_upgradeCompletedOk="$PGDATA/../.postgres14-upgrade-successful"

logPrefix="$(basename "$0")"
log() {
  echo "$(TZ=GMT date) [$logPrefix] $*"
}

if ! [[ -f "$flag_upgradeCompletedOk" ]]; then
  log "Waiting for upgrade to complete..."
  while ! [[ -f "$flag_upgradeCompletedOk" ]]; do sleep 1; done
  log "Upgrade complete."
fi

log "Starting postgres..."
# call ENTRYPOINT + CMD from parent Docker image
exec docker-entrypoint.sh postgres
