#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

docker_compose() {
  docker compose --file nginx.test.docker-compose.yml "$@"
}

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
