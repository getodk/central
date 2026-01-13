#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

echo "generating local service configuration.."

ENKETO_API_KEY=$(cat /etc/secrets/enketo-api-key) \
BASE_URL=$( [ "${HTTPS_PORT}" = 443 ] && echo https://"${DOMAIN}" || echo https://"${DOMAIN}":"${HTTPS_PORT}" ) \
/scripts/envsub.awk \
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

# Logs based on SENTRY_RELEASE and SENTRY_TAGS env variables
echo "logging server upgrade.."
node ./lib/bin/log-upgrade

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
  local cgroup_version memtot fallback_memtot
  cgroup_version=$(get_cgroup_version)
  fallback_memtot=$(grep MemTotal /proc/meminfo | awk '{print $2 * 1024}')

  if [ "$cgroup_version" == "v2" ]; then
    if [ -r /sys/fs/cgroup/memory.max ]; then
      memtot=$(cat /sys/fs/cgroup/memory.max)
    else
      memtot="max"
    fi
    if [ "$memtot" == "max" ]; then
      memtot=$fallback_memtot
    fi
  else
    # cgroup v1
    if [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
      memtot=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes)
    else
      memtot=$fallback_memtot
    fi
  fi

  # Force memtot to be an integer (not scientific notation e+09)
  printf "%.0f\n" "$memtot"
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
exec npx --no pm2-runtime ./pm2.config.js
