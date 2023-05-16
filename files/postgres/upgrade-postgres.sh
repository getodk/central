#!/bin/bash -eu

set -o pipefail

flag_upgradeCompletedOk="$PGDATANEW/../.postgres14-upgrade-successful"
flag_deleteOldData_name="delete-old-data"
flag_deleteOldData_internal="/postgres14-upgrade/$flag_deleteOldData_name"
flag_oldDataDeleted="/postgres14-upgrade/old-data-deleted"

logPrefix="$(basename "$0")"
log() {
  echo "$(TZ=GMT date) [$logPrefix] $*"
}

log "Checking for existing upgrade marker file..."
if [[ -f "$flag_upgradeCompletedOk" ]]; then
  log "Upgrade has been run previously."

  if [[ -f "$flag_deleteOldData_internal" ]]; then
    log "Deleting old data..."
    rm "$flag_deleteOldData_internal"
    rm -rf /var/lib/postgresql/data/*
    touch "$flag_oldDataDeleted"
    log "Old data deleted."
  elif [[ -f "$PGDATAOLD/PG_VERSION" ]]; then
    log "!!!"
    log "!!! WARNING: you still have old data from PostgreSQL 9.6"
    log "!!!"
    log "!!! This is taking up disk space: $(du -hs "$PGDATAOLD" 2>/dev/null | cut -f1)B"
    log "!!!"
    log "!!! Continue with the instructions at https://docs.getodk.org/central-upgrade/"
    log "!!!"
  fi
else
  if [[ -f "$flag_deleteOldData_internal" ]]; then
    log "!!!"
    log "!!! ERROR: Deletion request file created, but upgrade has not yet run!"
    log "!!!"
    log "!!! Please email support@getodk.org for assistance."
    log "!!!"
    exit 1
  fi

  if ! [[ -f "$PGDATAOLD/PG_VERSION" ]]; then
    log "No old data found."
  elif [[ -f "$PGDATANEW/PG_VERSION" ]]; then
    log "!!!"
    log "!!! ERROR: New data found, but upgrade not flagged as complete."
    log "!!!"
    log "!!! Please email support@getodk.org for assistance."
    log "!!!"
    exit 1
  else (
    log "Upgrade not run previously; upgrading now..."

    log "From: $PGDATAOLD"
    log "  To: $PGDATANEW"

    # standard ENTRYPOINT/CMD combo from parent Dockerfile
    if ! docker-upgrade pg_upgrade; then
      log "!!!"
      log "!!! pg_upgrade FAILED; dumping log files..."
      log "!!!"
      tail -n+1 pg_upgrade_*.log || log "No pg_upgrade log files found ¯\_(ツ)_/¯"
      log "!!!"
      log "!!! pg_upgrade FAILED; check above for clues."
      log "!!!"
      exit 1
    fi

    # see https://github.com/tianon/docker-postgres-upgrade/issues/16,
    #     https://github.com/tianon/docker-postgres-upgrade/issues/1
    cp "$PGDATAOLD/pg_hba.conf" "$PGDATANEW/pg_hba.conf"

    log "Starting postgres server for maintenance..."
    gosu postgres pg_ctl -D "$PGDATANEW" -l logfile start

    # As recommended by pg_upgrade:
    log "Updating extensions..."
    psql -f update_extensions.sql

    # As recommended by pg_upgrade:
    log "Regenerating optimizer statistics..."
    /usr/lib/postgresql/14/bin/vacuumdb --all --analyze-in-stages

    log "Stopping postgres server..."
    gosu postgres pg_ctl -D "$PGDATANEW" -m smart stop

    # pg_upgrade recommends running ./delete_old_cluster.sh, which
    # just runs `rm -rf '/var/lib/postgresql/data'`.  Doing this here
    # can fail with "Device or resource busy".  In addition, deleting
    # the old data may be risky if the upgrade didn't complete
    # perfectly.  We can hedge our bets and make life easier by
    # skipping cleanup here, and providing a docker command to prune
    # the old, unused volume in the next odk-central version.

    log "Upgrade complete."
  ) > >(tee --append "/postgres14-upgrade/upgrade-postgres.log" >&2) 2>&1
  fi
  touch "$flag_upgradeCompletedOk"
  touch "/postgres14-upgrade/upgrade-successful"
fi

log "Complete."
