#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[test-with-pgenvblock] $*"; }

log "Testing..."

log "  Testing: specific postgres-related variables..."
if diff \
    <(
      env --ignore-environment \
          files/service/with-pgenvblock.pl \
          <(printf "A=1\0PGSSLMODE=2\0C=3\0PGDATABASE=4\0E=5\0NODE_EXTRA_CA_CERTS=5\0\G=7") \
          env \
      | tr '\0' '\n'
    ) \
    <(cat <<EOF
PGSSLMODE=2
PGDATABASE=4
EOF
)
then
  log "    Passed OK."
else
  log "!!!"
  log "!!! Test failed; see above for differences between '< actual' and '> expected'"
  log "!!!"
  exit 1
fi

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
