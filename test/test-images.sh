#!/bin/bash -eux
set -o pipefail

log() { echo >&2 "[$(basename "$0")] $*"; }

echo 'SSL_TYPE=selfsign
DOMAIN=local
SYSADMIN_EMAIL=no-reply@getodk.org' > .env

touch ./files/allow-postgres14-upgrade

docker compose build

# we allow a long retry period for the first check because the first-run
# nginx setup could take several minutes due to key generation.
log "Verifying frontend and backend load..."
docker compose up -d
CONTAINER_NAME=$(docker inspect -f '{{.Name}}' "$(docker compose ps -q nginx)" | cut -c2-)
docker run --network container:"$CONTAINER_NAME" \
    appropriate/curl -4 --insecure --retry 30 --retry-delay 10 --retry-connrefused https://localhost/ -H 'Host: local' \
| tee /dev/tty \
| grep -q 'ODK Central'

docker run --network container:"$CONTAINER_NAME" \
    appropriate/curl -4 --insecure --retry 20 --retry-delay 2 --retry-connrefused https://localhost/v1/projects -H 'Host: local' \
| tee /dev/tty \
| grep -q '\[\]'

log "Verifying pm2..."
docker compose exec -T service npx pm2 list \
| tee /dev/tty \
| grep -c "online" \
| grep -q 4

log "All OK."
