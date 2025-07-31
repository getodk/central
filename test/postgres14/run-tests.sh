#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

docker_compose() {
  docker compose --file postgres14.test.docker-compose.yml "$@"
}

wait_for_postgres_response() {
  local seconds="$1"
  local port="$2"
  echo >&2 -n "[$(basename "$0")] [$(date)] Waiting for postgres on: $port "
  if timeout "$seconds" bash -c -- "
    until ss -Htnlp 'sport = :5432' 2>/dev/null | read; do
      printf >&2 .
      sleep 0.25
    done
  "; then
    printf >&2 '✅\n'
  else
    printf >&2 '❌\n'
    log "!!! Postgres connection timed out for port: $port"
    exit 1
  fi
}

log "Starting test services..."
docker_compose up --build --detach

log "Debugging docker stuff:"
docker ps

log "Container env:"
docker_compose exec postgres14 env

log "shm size:"
docker_compose exec postgres14 df -h /dev/shm

log "Marking pg14 upgrade as complete..."
sleep 5 # is this for fun?  or somehow useful?
docker_compose exec postgres14 bash -c '
  set -e
  mkdir -p "$PGDATA/.."
  touch "$PGDATA/../.postgres14-upgrade-successful"
'

log "Waiting for postgres..."
wait_for_postgres_response 15 5432

npm run test:postgres14

log "Completed OK."
