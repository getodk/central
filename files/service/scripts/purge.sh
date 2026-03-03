#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

# shellcheck disable=SC1090
source /usr/share/odk/env.d/*

cd /usr/odk
/usr/local/bin/node lib/bin/purge.js >/proc/1/fd/1 2>/proc/1/fd/2
