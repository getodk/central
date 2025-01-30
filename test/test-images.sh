#!/bin/bash -eux
set -o pipefail

log() { echo >&2 "[$(basename "$0")] $*"; }

check_path() {
  local timeout="$1"
  local requestPath="$2"
  local expected="$3"

  for (( i=0; i<"$timeout"; ++i )); do
    res = echo -e "GET $requestPath HTTP/1.0\r\nHost: local\r\n\r\n" |
        docker run -i container:"$CONTAINER_NAME" \
        openssl 2>&1 s_client -quiet -connect 127.0.0.1:443
    if echo "$res" | grep -q "$expected"; then
      return
    fi
  done

  log "!!! Path $requestPath returned unexpected result:"
  echo
  echo "$res"
  echo
  exit 1
}

echo 'SSL_TYPE=selfsign
DOMAIN=local
SYSADMIN_EMAIL=no-reply@getodk.org' > .env

touch ./files/allow-postgres14-upgrade

docker compose build

# we allow a long retry period for the first check because the first-run
# nginx setup could take several minutes due to key generation.
log "Verifying frontend and backend load..."
docker compose up -d
check_path 30 / 'ODK Central'
check_path 20 /v1/projects '[]'

log "Verifying pm2..."
docker compose exec -T service npx pm2 list \
| tee /dev/tty \
| grep -c "online" \
| grep -q 4

log "All OK."
