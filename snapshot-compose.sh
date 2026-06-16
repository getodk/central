#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

docker compose \
    --file docker-compose.yml \
    --file snapshots.docker-compose.yml \
    "$@"
