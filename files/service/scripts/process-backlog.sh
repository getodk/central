#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

cd /usr/odk
/usr/local/bin/node lib/bin/process-backlog.js >/proc/1/fd/1 2>/proc/1/fd/2
