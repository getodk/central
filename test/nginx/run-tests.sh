#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

docker_compose() {
  docker compose --file nginx.test.docker-compose.yml "$@"
}

wait_for_http_response() {
  local seconds="$1"
  local url="$2"
  local expectedStatus="${3-200}"
  echo >&2 -n "[$(basename "$0")] [$(date)] Waiting for server: $url "
  if timeout "$seconds" bash -c -- "
    until [[ \$(curl --max-time 1 --silent --output /dev/null -w '%{http_code}' '$url') = \"$expectedStatus\" ]]; do
      printf >&2 .
      sleep 0.25
    done
  "; then
    printf >&2 '✅\n'
  else
    printf >&2 '❌\n'
    log "!!! URL timed out: $url"
    exit 1
  fi
}

log "Starting test services..."
docker_compose up --build --detach

log "Waiting for mock backend..."
wait_for_http_response 5 localhost:8383/health 200
log "Waiting for mock enketo..."
wait_for_http_response 5 localhost:8005/health 200
log "Waiting for nginx..."
wait_for_http_response 5 localhost:9000 421

npm run test:nginx

log "Linting nginx config with gixy-ng..."
# gixy-ng is a maintained fork of gixy: https://github.com/dvershinin/gixy
# For version updates, see: https://pypi.org/project/gixy-ng/#history
docker_compose exec nginx bash -euc '
  apt update
  apt install -y python3-venv
  python3 -m venv .venv
  . .venv/bin/activate
  pip install gixy-ng==0.2.12
  gixy -lll
'

log "Completed OK."
