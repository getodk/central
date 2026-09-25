#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[test-with-pgenvblock] $*"; }

test_env() {
  title="$1"
  envblock="$2"
  expectedEnv="$3"

  log "  Testing: $title..."
  if diff \
      <(xxd <(
        env --ignore-environment \
            files/service/with-pgenvblock.pl \
            <(printf "$envblock") \
            env --null
      )) \
      <(xxd <(printf %b "$expectedEnv"))
  then
    log "    Passed OK."
  else
    log "!!!"
    log "!!! Test failed; see above for differences between '< actual' and '> expected'"
    log "!!!"
    exit 1
  fi
}

log "Testing..."

test_env "empty env" "" ""

test_env "no postgres-related vars 1" "A=1" ""
test_env "no postgres-related vars 2" "A=1\0B=2" ""
test_env "no postgres-related vars 3" "A=1\0B=2\0C=3" ""

test_env "specific postgres-related variables" \
         "A=1\0PGSSLMODE=2\0C=3\0PGDATABASE=4\0E=5\0NODE_EXTRA_CA_CERTS=5\0G=7" \
         "PGSSLMODE=2\0PGDATABASE=4\0"

log "  Testing: local env + an injected var..."
# for the skeptical reader, on the below:
# note that the environment setting (with `export`) runs in a subshell, and as such doesn't touch our own environment,
# and as such thus also not the environment with-pgenvblock.pl's is launched with; and thus the PGBLA environment variable
# that the `env` invocation sees comes from `with-pgenvblock.pl`'s reading of the env block file and nowhere else.
if files/service/with-pgenvblock.pl <(export PGBLA=hurray; cat /proc/self/environ) env | grep --quiet '^PGBLA=hurray$'; then
  log "    Passed OK."
else
  log "    !!! Test failed."
  exit 1
fi

log "All tests passed OK."
