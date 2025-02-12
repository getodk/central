#!/usr/bin/env bash

echo "generating local service configuration.."

ENKETO_API_KEY=$(cat /etc/secrets/enketo-api-key) \
BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
envsubst '$DOMAIN $BASE_URL $SYSADMIN_EMAIL $ENKETO_API_KEY $DB_HOST $DB_USER $DB_PASSWORD $DB_NAME $DB_SSL $EMAIL_FROM $EMAIL_HOST $EMAIL_PORT $EMAIL_SECURE $EMAIL_IGNORE_TLS $EMAIL_USER $EMAIL_PASSWORD $OIDC_ENABLED $OIDC_ISSUER_URL $OIDC_CLIENT_ID $OIDC_CLIENT_SECRET $SENTRY_ORG_SUBDOMAIN $SENTRY_KEY $SENTRY_PROJECT $S3_SERVER $S3_ACCESS_KEY $S3_SECRET_KEY $S3_BUCKET_NAME' \
    < /usr/share/odk/config.json.template \
    > /usr/odk/config/local.json

SENTRY_RELEASE="$(cat sentry-versions/server)"
export SENTRY_RELEASE
# shellcheck disable=SC2089
SENTRY_TAGS="{ \"version.central\": \"$(cat sentry-versions/central)\", \"version.client\": \"$(cat sentry-versions/client)\" }"
# shellcheck disable=SC2090
export SENTRY_TAGS

echo "running migrations.."
node ./lib/bin/run-migrations

echo "checking migration success.."
if ! node ./lib/bin/check-migrations; then
  echo "*** Error starting ODK! ***"
  echo "After attempting to automatically migrate the database, we have detected unapplied migrations, which suggests a problem with the database migration step. Please look in the console above this message for any errors and post what you find in the forum: https://forum.getodk.org/"
  exit 1
fi

echo "starting cron.."
cron -f &

get_cgroup_version() {
  # The max memory calculation is different between cgroup v1 & v2
  local cgroup_type
  cgroup_type=$(stat -fc %T /sys/fs/cgroup/)
  if [ "$cgroup_type" == "cgroup2fs" ]; then
    echo "v2"
  else
    echo "v1"
  fi
}

get_memory_limit() {
  local cgroup_version
  cgroup_version=$(get_cgroup_version)

  if [ "$cgroup_version" == "v2" ]; then
    local memtot
    memtot=$(cat /sys/fs/cgroup/memory.max)
    if [ "$memtot" == "max" ]; then
      # No cgroup memory limit; fallback to system's total memory
      memtot=$(grep MemTotal /proc/meminfo | awk '{print $2 * 1024}')
    fi
    # Force memtot to be an integer (not scientific notation e+09)
    printf "%.0f\n" "$memtot"
  else
    # cgroup v1
    local memtot
    memtot=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
    # Force memtot to be an integer
    printf "%.0f\n" "$memtot"
  fi
}

determine_worker_count() {
  local memtot=$1
  if [ "$memtot" -gt 1100000 ]; then
    echo 4
  else
    echo 1
  fi
}

MEMTOT=$(get_memory_limit)
WORKER_COUNT=$(determine_worker_count "$MEMTOT")
export WORKER_COUNT
echo "using $WORKER_COUNT worker(s) based on available memory ($MEMTOT).."

echo "starting server."
exec npx pm2-runtime ./pm2.config.js

