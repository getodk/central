#!/bin/bash -eu
cd client
npm clean-install --no-audit --fund=false --update-notifier=false
if [[ -n $OIDC_DISCOVERY_URL ]]; then
  export VUE_APP_OIDC_ENABLED=true
fi
npm run build
