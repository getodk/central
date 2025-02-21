#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

scriptFiles="$(cat <(git grep -El '^#!.*sh\b') <(git ls-files | grep -E '.sh$') | sort -u)"

for script in $scriptFiles; do
  log "Checking $script ..."

  log "  Checking trailing whitespace on lines..."
  if grep -E '\s+$' "$script"; then
    log "    !!! Whitespace found at end of line !!!"
    exit 1
  fi
  log "    Passed OK."

  log "  Checking trailing newline in files..."
  if [[ -n "$(tail -c 1 < "$script")" ]]; then
    log "    !!! Missing final newline !!!"
    exit 1
  fi
  if [[ -z "$(tail -c 2 < "$script")" ]]; then
    log "    !!! Blank lines at end of file !!!"
    exit 1
  fi
  log "    Passed OK."

  log "  Checking for tab-based indentation..."
  if grep $'\t' "$script"; then
    log "    !!! Tab(s) found."
    log "    !!!"
    log "    !!! Please use spaces for indentation."
    exit 1
  fi
  log "    Passed OK."
done

log "Running shellcheck..."
echo "$scriptFiles" | xargs \
    shellcheck \
        --exclude=SC2016
log "  Shellcheck passed OK."

log "All scripts passed OK."
