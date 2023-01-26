#!/bin/bash -eu

log() {
  echo "[upgrade] $*"
}

log "Updating code..."
git pull
git submodule update -i
log "Code updated."

log "Checking disk space is sufficient..."
sudo ./check-available-space

if ! [[ -f ./allow-postgres14-upgrade ]]; then
	log "!!!"
	log "!!! Expected file not found: allow-postgres14-upgrade"
	log "!!!"
	log "!!! Have you definitely read the upgrade documentation?"
	log "!!!"
	log "!!! Please see: https://docs.getodk.org/central-upgrade/"
	log "!!!"
	exit 1
fi

log "Building new docker containers..."
docker-compose stop
docker-compose build
log "Docker containers built."

log "Upgrading database..."
docker-compose up postgres
if ! [[ -f ./postgres14-upgrade/upgrade-completed-ok ]]; then
  log "!!!"
  log "!!! ERROR: Upgrade success flag file not found!"
  log "!!!"
	log "!!! Please email support@getodk.org for assistance."
  log "!!!"
  exit 1
fi
log "Database upgraded OK."

log "Restarting docker services..."
docker-compose up -d
log "Restarted."
