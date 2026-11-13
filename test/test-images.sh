#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

tmp="$(mktemp)"

check_path() {
  local retries="$1"
  local requestPath="$2"
  local expected="$3"

  for (( i=0; ; ++i )); do
    log "Checking response from $requestPath ..."
    echo -e "GET $requestPath HTTP/1.0\r\nHost: local\r\n\r\n" |
        docker compose exec --no-TTY nginx \
            openssl s_client -quiet -connect 127.0.0.1:443 \
            >"$tmp" 2>&1 || true
    if grep --silent --fixed-strings "$expected" "$tmp"; then
      log "  Request responded correctly."
      return
    fi

    if [[ "$i" -lt "$retries" ]]; then
      log "  Request did not respond correctly; sleeping..."
      sleep 1
    else
      log "!!! Retry count exceeded."
      log "!!! Final response:"
      echo
      cat "$tmp"
      echo

      exit 1
    fi
  done
}

echo 'SSL_TYPE=selfsign
DOMAIN=local
SYSADMIN_EMAIL=no-reply@getodk.org' > .env

touch ./files/allow-postgres14-upgrade

log "Building docker containers (FRONTEND_BUILD_MODE='${FRONTEND_BUILD_MODE-}')..."
docker compose build --build-arg "FRONTEND_BUILD_MODE=$FRONTEND_BUILD_MODE"

log "Starting containers..."
docker compose up --detach

log "Verifying version.txt..."
case "$FRONTEND_BUILD_MODE" in
  source)     expectedClientHash="$(   cd client && git rev-parse HEAD)"
              expectedClientVersion="$(cd client && git describe --tags --always)"
              ;;
  fetch|test) expectedClientHash="0000000000000000000000000000000000000000"
              expectedClientVersion="$FRONTEND_VERSION"
              ;;
  *) exit 1
esac
diff \
     <(docker compose exec nginx cat /usr/share/nginx/html/version.txt) \
     <(cat <<EOF
versions:
$(git rev-parse HEAD) ($(git describe --tags --always))
 $expectedClientHash client ($expectedClientVersion)
 $(cd server && git rev-parse HEAD) server ($(cd server && git describe --tags --always))
EOF
     )
log "version.txt looks OK."

log "Verifying frontend..."
check_path 180 / 'ODK Central'
log "  Frontend started OK."

log "Verifying backend..."
check_path 20 /v1/projects '{"message":"Could not authenticate with the provided credentials.","code":401.2}'
log "  Backend started OK."

log "Verifying enketo..."
check_path 2 /-/ 'Enketo is running!'
log "  Enketo started OK."

log "Verifying pm2..."
docker compose exec service npx --no pm2 list | tee "$tmp"
processCount="$(grep --count online "$tmp")"
if [[ "$processCount" != 4 ]]; then
  log "!!! PM2 returned an unexpected count for online processes."
  log "!!!"
  log "!!! Expected 4, but got $processCount."

  exit 1
fi

log "Verifying db backup/restore..."
# Test integration of various packages & compatibility between versions, including:
#
# * pg_dump & pg_restore inside service container
# * postgres version in postgres14 container
# * openssl version in service container
# * openssl version in postgres14 container
#
# NOTE the backup, verify & restore commands, processes & config used in these
# tests should follow the official documentation as closely as possible.
#
# See: https://docs.getodk.org/central-backup/

adminUserEmail=odk-central-admin@example.test
adminUserPword="topSecret-$RANDOM|123"
nginxHost="https://localhost"

test_backup_restore() {
  local testDescription="$1"
  local passphrase="$2"
  local tmpConfig
  tmpConfig="$(mktemp)"
  backupsDir="$(mktemp --directory)"
  backupFile="$backupsDir/backup.enc.bin"

  log "Checking pg_dump version..."
  docker compose exec service pg_dump --version # FIXME delete this - just for debug
  log "Checking container pg_restore version..."
  docker compose exec service pg_restore --version # FIXME delete this - just for debug
  log "Checking local pg_restore version..."
  pg_restore --version

  log "Testing backup $testDescription..."

  log "Writing curl config file..."
  cat >"$tmpConfig" <<EOF
url = "https://local/v1/backup"
user = "$adminUserEmail:$adminUserPword"
json = {"passphrase":"$passphrase"}
#output-dir = $backupsDir
#http1.1
show-error
fail
#remote-name
#remote-header-name # disabled; maybe not a good recommendation?  FIXME research if docs should be updated to remove this
remove-on-error
no-clobber
create-dirs
write-out = "%{onerror}%{stderr}\n\n\n\tAN ERROR OCCURRED AND YOUR BACKUP WAS NOT SAVED\n\n\n"
EOF

  log "Backing up to $backupFile ..."
  curl \
      --verbose \
      --insecure \
      --resolve local:443:127.0.0.1 \
      --output "$backupFile" \
      --config "$tmpConfig" \
      --http1.0
      # FIXME remove http1.0 - just trying to get things working, but this is not a permanent solution

  log "Verifying backup..."
  # TODO this may require documentation updates for ensuring the pg_restore version used to check is the same as the version used inside the container
  openssl enc -d -chacha20 -pbkdf2 -pass "pass:$passphrase" <"$backupFile" | docker compose exec -T service pg_restore --file /dev/null

  log "Stopping service container to allow db restore..."
  docker compose stop service

  log "Debugging what might be owned by the odk user..."
  docker compose exec postgres14 psql -U odk odk -c "
    SELECT n.nspname AS schema_name
         , c.relname AS object_name
         , CASE c.relkind
             WHEN 'r' THEN 'table'
             WHEN 'v' THEN 'view'
             WHEN 'm' THEN 'materialized view'
             WHEN 'S' THEN 'sequence'
             WHEN 'f' THEN 'foreign table'
             ELSE c.relkind::text
           END AS object_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_authid a ON a.oid = c.relowner
      WHERE a.rolname = 'odk'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  "
  log "---"
  docker compose exec postgres14 psql -U odk odk -c "
    SELECT b.classid::regclass AS dependent_type
         , b.objid AS dependent_object_id
         , b.refclassid::regclass AS referenced_type
         , d.extname AS extension_name
      FROM pg_depend b
      LEFT JOIN pg_extension d ON d.oid = b.objid
      WHERE b.refobjid = (SELECT oid FROM pg_roles WHERE rolname = 'odk')
  "
  log "---"

  log "Restoring backup..."
  # N.B. "useless use of cat" deliberately echoes documented command at https://docs.getodk.org/central-backup/#restoring-a-backup
  # shellcheck disable=SC2002
  cat "$backupFile" | docker compose run --rm -T service node /usr/odk/lib/bin/restore.js - "$passphrase"

  log "Restarting service container..."
  docker compose start service
  check_path 5 /v1/projects '{"message":"Could not authenticate with the provided credentials.","code":401.2}'
}

# FIXME debug remove
docker ps

log "Waiting for service to become available..."
./test/wait-for-http-response.sh 30 "$nginxHost" || true

log "Ensuring admin user exists..."
echo "$adminUserPword" | docker compose exec -T service node /usr/odk/lib/bin/cli --email "$adminUserEmail" user-create
                         docker compose exec -T service node /usr/odk/lib/bin/cli --email "$adminUserEmail" user-promote
log "Starting backup/restore tests..."
test_backup_restore "without passphrase" ""
test_backup_restore "with passphrase" "hunter2"

log "All OK."
