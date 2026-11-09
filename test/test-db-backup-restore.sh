#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

# Test integration of various packages & compatibility between versions, including:
#
# * pg_dump & pg_restore inside service container
# * postgres version in postgres14 container
# * openssl version in service container
# * openssl version in postgres14 container
#
# NOTE the backup, verify & restore commands/processes used in these tests should
# follow the official documentation as closely as possible.
#
# See: https://docs.getodk.org/central-backup/

test_backup_restore() {
  local testDescription="$1"
  local passphrase="$2"
  local tmpConfig
  tmpConfig="$(mktemp)"
  backupsDir="$(mktemp --directory)"

  log "Testing backup $testDescription..."

  log "Writing curl config file..."
  cat >"$tmpConfig" <<EOF
url = "http://127.0.0.1:8686/v1/backup"
user = someone@somewhere.somedomain
json = {"passphrase":"$passphrase"}
output-dir = $backupsDir
http1.1
show-error
fail
remote-name
remote-header-name
remove-on-error
no-clobber
create-dirs
write-out = "%{onerror}%{stderr}\n\n\n\tAN ERROR OCCURRED AND YOUR BACKUP WAS NOT SAVED\n\n\n"
EOF

  log "Backing up..."
  curl --config "$tmpConfig"

  log "Identifying backup file..."
  backupFile="$backupsDir"/*
  log "Backup found at: $backupFile"

  log "Verifying backup..."
  openssl enc -d -chacha20 -pbkdf2 -pass "pass:$passphrase" <"$backupFile" | pg_restore --file /dev/null

  log "Restoring backup..."
  cat "$backupFile" | docker compose exec -T service node /usr/odk/lib/bin/restore.js - "$passphrase"
}

log "Starting containers..."
docker compose up
log "Ensuring admin user exists..."
docker compose exec --no-tty service node /usr/odk/lib/bin/cli
log "Starting backup/restore tests..."
test_backup_restore "without passphrase" ""
test_backup_restore "with passphrase" "hunter2"
log "All tests completed OK."
