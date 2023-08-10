#!/bin/bash -eu
cd client
npm clean-install --no-audit --fund=false --update-notifier=false
if [[ -n $OIDC_DISCOVERY_URL && -n $OIDC_CLIENT_ID && -n $OIDC_CLIENT_SECRET ]]; then
  export VUE_APP_OIDC_ENABLED=true
fi
npm run build
