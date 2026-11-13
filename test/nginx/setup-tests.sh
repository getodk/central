#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

docker_compose() {
  docker compose --file nginx.test.docker-compose.yml "$@"
}

log "Starting test services..."
docker_compose up --build --detach

log "Waiting for mock backend..."
../wait-for-http-response.sh 5 localhost:8383/__mock_http_server/health 200
log "Waiting for mock enketo..."
../wait-for-http-response.sh 5 localhost:8005/__mock_http_server/health 200
log "Waiting for nginx..."
../wait-for-http-response.sh 5 localhost:9000 421

log "Completed OK."
