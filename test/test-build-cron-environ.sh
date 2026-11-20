#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

test_env() {
  title="$1"
  expectedEnv="$2"
  shift 2

  log "  Testing: $title..."
  if diff \
      <(
        env --ignore-environment \
            "$@" \
            files/service/scripts/build-cron-environ.pl \
        | xxd
      ) \
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

test_env "empty env" ""

test_env "no relevant vars 1" "" $'A=1'
test_env "no relevant vars 2" "" $'A=1' $'B=2'
test_env "no relevant vars 3" "" $'A=1' $'B=2' $'C=3'

test_env "specific sentry-related variables" \
         "SENTRY_TAG=2\0SENTRY_ENVIRONMENT=4\0" \
         $'A=1' $'SENTRY_TAG=2' $'C=3' $'SENTRY_ENVIRONMENT=4' $'E=5' $'NODE_EXTRA_CA_CERTS=5' $'G=7'

test_env "specific postgres-related variables" \
         "PGSSLMODE=2\0PGDATABASE=4\0" \
         $'A=1' $'PGSSLMODE=2' $'C=3' $'PGDATABASE=4' $'E=5' $'NODE_EXTRA_CA_CERTS=5' $'G=7'

test_env "specific postgres-related variables with linebreak (unrelated var)" \
         "PGSSLMODE=2\0PGDATABASE=4\0" \
         $'A=1' $'PGSSLMODE=2' $'C=3\nhas\nlinebreaks' $'PGDATABASE=4' $'E=5' $'NODE_EXTRA_CA_CERTS=5' $'G=7'

test_env "specific postgres-related variables with linebreak (final var)" \
         "PGSSLMODE=2\0PGDATABASE=4\0PGWITHLINEBREAKS=have\na\nbreak\0" \
         $'A=1' $'PGSSLMODE=2' $'C=3' $'PGDATABASE=4' $'E=5' $'NODE_EXTRA_CA_CERTS=5' $'G=7' $'PGWITHLINEBREAKS=have\na\nbreak' $'I=8'

test_env "specific postgres-related variables with linebreak (non-final var)" \
         "PGSSLMODE=2\0PGDATABASE=4\0PGWITHLINEBREAKS=have\na\nbreak\0PGAPPNAME=my_app\0" \
         $'A=1' $'PGSSLMODE=2' $'C=3' $'PGDATABASE=4' $'E=5' $'NODE_EXTRA_CA_CERTS=5' $'G=7' $'PGWITHLINEBREAKS=have\na\nbreak' $'I=8' $'PGAPPNAME=my_app' $'K=10'

log "All tests passed OK."
