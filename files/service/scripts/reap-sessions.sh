#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit

cd /usr/odk
/usr/local/bin/node lib/bin/reap-sessions.js >/proc/1/fd/1 2>/proc/1/fd/2
