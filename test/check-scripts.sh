#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

expectedShebang=$'#!/bin/bash -eu\nset -o pipefail\nshopt -s inherit_errexit\n'

scriptFiles="$(cat <(git grep -El '^#!.*sh\b') <(git ls-files | grep -E '.sh$') | sort -u)"

for script in $scriptFiles; do
  log "Checking $script ..."

  log "  Checking shebang..."
  shebang="$(head -n3 "$script")"
  if ! diff <(echo "$shebang") <(printf '%s' "$expectedShebang"); then
    log "    !!!"
    log "    !!! Missing or unexpected shebang."
    log "    !!!"
    log "    !!! To make reasoning about script behaviour easier, please"
    log "    !!! use the standard shebang and shell config lines:"
    log "    !!!"
    echo
    printf '%s' "$expectedShebang"
    echo
    exit 1
  fi
  log "    Passed OK."

  log "  Checking for indirect invocations..."
  # shellcheck disable=2086
  if git grep -E "sh.*$(basename "$script")" $scriptFiles; then
    log "    !!!"
    log "    !!! Possible indirect invocation(s) found."
    log "    !!!"
    log "    !!! Invoking scripts indirectly means they may be run with an"
    log "    !!! unexpected shell.  Try invoking the script directly and"
    log "    !!! relying on its shebang."
    log "    !!!"
    exit 1
  fi
  log "    Passed OK."
done

log "Running shellcheck..."
echo "$scriptFiles" | xargs \
    shellcheck \
        --exclude=SC2016 \
        "$script"
log "  Shellcheck passed OK."

log "All scripts passed OK."
