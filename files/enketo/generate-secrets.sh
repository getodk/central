#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

if [ ! -f /etc/secrets/enketo-secret ]; then
  head -c1024 /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c64  > /etc/secrets/enketo-secret
fi

if [ ! -f /etc/secrets/enketo-less-secret ]; then
  head -c512  /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c32  > /etc/secrets/enketo-less-secret
fi

if [ ! -f /etc/secrets/enketo-api-key ]; then
  head -c2048 /dev/urandom | LC_ALL=C tr -dc '[:alnum:]' | head -c128 > /etc/secrets/enketo-api-key
fi
