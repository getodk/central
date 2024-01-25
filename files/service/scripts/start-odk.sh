#!/usr/bin/env bash

echo "generating local service configuration.."

ENKETO_API_KEY=$(cat /etc/secrets/enketo-api-key) \
BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
envsubst '$DOMAIN $BASE_URL $SYSADMIN_EMAIL $ENKETO_API_KEY $DB_HOST $DB_USER $DB_PASSWORD $DB_NAME $DB_SSL $EMAIL_FROM $EMAIL_HOST $EMAIL_PORT $EMAIL_SECURE $EMAIL_IGNORE_TLS $EMAIL_USER $EMAIL_PASSWORD $OIDC_ENABLED $OIDC_ISSUER_URL $OIDC_CLIENT_ID $OIDC_CLIENT_SECRET $SENTRY_ORG_SUBDOMAIN $SENTRY_KEY $SENTRY_PROJECT' \
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
node ./lib/bin/check-migrations

if [ $? -eq 1 ]; then
  echo "*** Error starting ODK! ***"
  echo "After attempting to automatically migrate the database, we have detected unapplied migrations, which suggests a problem with the database migration step. Please look in the console above this message for any errors and post what you find in the forum: https://forum.getodk.org/"
  exit 1
fi

echo "starting cron.."
cron -f &

MEMTOT=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
if [ "$MEMTOT" -gt "1100000" ]
then
  export WORKER_COUNT=4
else
  export WORKER_COUNT=1
fi
echo "using $WORKER_COUNT worker(s) based on available memory ($MEMTOT).."

echo "starting server."
exec npx pm2-runtime ./pm2.config.js

