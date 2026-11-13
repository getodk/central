#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

# Exit cleanly without attempting upload if there are no S3-related vars set.
if [[ -z "${S3_SERVER-}" ]] &&
   [[ -z "${S3_ACCESS_KEY-}" ]] &&
   [[ -z "${S3_BUCKET_NAME-}" ]] &&
   [[ -z "${S3_SECRET_KEY-}" ]]; then
  exit
fi

cd /usr/odk
/usr/local/bin/node lib/bin/s3.js upload-pending >/proc/1/fd/1 2>/proc/1/fd/2
