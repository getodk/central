#!/bin/bash -eu
cd client
npm clean-install --no-audit --fund=false --update-notifier=false
VUE_APP_OIDC_ENABLED="$OIDC_ENABLED" npm run build
