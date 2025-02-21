#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

scriptFiles="$(cat <(git grep -El '^#!.*sh\b') <(git ls-files | grep -E '.sh$') | sort -u)"

log "Running shellcheck..."
echo "$scriptFiles" | xargs \
    shellcheck \
        --exclude=SC2016
log "  Shellcheck passed OK."

log "All scripts passed OK."
