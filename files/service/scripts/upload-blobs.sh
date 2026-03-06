#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

cd /usr/odk
/usr/local/bin/node lib/bin/s3.js upload-pending >/proc/1/fd/1 2>/proc/1/fd/2
