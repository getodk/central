#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

seconds="$1"
url="$2"
expectedStatus="${3-200}"

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
