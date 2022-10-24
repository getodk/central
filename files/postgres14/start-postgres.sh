#!/bin/bash -eu
set -o pipefail

flag_upgradeCompletedOk="$PGDATA/../.postgres14-upgrade-completed-ok"

logPrefix="$(basename $0)"
log() {
  echo "$(TZ=GMT date) [$logPrefix] $*"
}

log "Waiting for upgrade to complete..."
while ! [[ -f "$flag_upgradeCompletedOk" ]]; do sleep 1; done
log "Upgrade complete."

log "Starting postgres..."
# call ENTRYPOINT + CMD from parent Docker image
docker-entrypoint.sh postgres
