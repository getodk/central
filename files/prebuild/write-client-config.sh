#!/bin/bash -eu
set -o pipefail

if [[ $OIDC_ENABLED != 'true' ]] && [[ $OIDC_ENABLED != 'false' ]]; then
  echo 'OIDC_ENABLED must be either true or false'
  exit 1
fi

envsubst < files/nginx/client-config.json.template > /tmp/client-config.json
