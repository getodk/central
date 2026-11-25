#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

# Checks that the generated service config only includes SMTP `auth` when
# EMAIL_USER or EMAIL_PASSWORD is set.
# See https://github.com/getodk/central/issues/2295

log() { echo >&2 "[$(basename "$0")] $*"; }

cd "$(dirname "$0")/.."

tmpDir="$(mktemp -d)"
trap 'rm -rf "$tmpDir"' EXIT

failCount=0

renderConfig() {
  local user="$1" pass="$2"
  local out="$tmpDir/local.json"
  EMAIL_USER="$user" \
  EMAIL_PASSWORD="$pass" \
  EMAIL_FROM=no-reply@example.test \
  EMAIL_HOST=mail \
  EMAIL_PORT=25 \
  EMAIL_SECURE=false \
  EMAIL_IGNORE_TLS=true \
  DB_POOL_SIZE=10 \
  SESSION_LIFETIME=86400 \
  ENKETO_API_KEY=key \
  BASE_URL=https://example.test \
  SYSADMIN_EMAIL=admin@example.test \
  OIDC_ENABLED=false \
  OIDC_ISSUER_URL='' \
  OIDC_CLIENT_ID='' \
  OIDC_CLIENT_SECRET='' \
  SENTRY_ORG_SUBDOMAIN='' \
  SENTRY_KEY='' \
  SENTRY_PROJECT='' \
  SENTRY_TRACE_RATE='' \
  S3_SERVER='' \
  S3_ACCESS_KEY='' \
  S3_SECRET_KEY='' \
  S3_BUCKET_NAME='' \
  ./files/shared/envsub.awk \
      < files/service/config.json.template \
      > "$out"
  node ./files/service/scripts/remove-empty-email-auth.js "$out" >/dev/null
  node -e '
    const auth = require(process.argv[1]).default.email.transportOpts.auth;
    console.log(auth === undefined ? "no-auth" : JSON.stringify(auth));
  ' "$out"
}

check() {
  local description="$1" expected="$2" actual="$3"
  log "$description"
  if [[ "$actual" = "$expected" ]]; then
    log "  OK"
  else
    ((++failCount))
    log "  FAILED: expected '$expected', got '$actual'"
  fi
}

check "should omit auth when EMAIL_USER and EMAIL_PASSWORD are empty" \
    'no-auth' "$(renderConfig '' '')"

check "should keep auth when EMAIL_USER and EMAIL_PASSWORD are set" \
    '{"user":"alice","pass":"secret"}' "$(renderConfig alice secret)"

check "should keep auth when only EMAIL_USER is set" \
    '{"user":"alice","pass":""}' "$(renderConfig alice '')"

check "should keep auth when only EMAIL_PASSWORD is set" \
    '{"user":"","pass":"secret"}' "$(renderConfig '' secret)"

if [[ "$failCount" = 0 ]]; then
  log "All tests passed OK."
else
  log "$failCount test(s) FAILED."
  exit 1
fi
