#!/bin/bash -eu

cd client

if [[ ${SKIP_FRONTEND_BUILD-} != "" ]]; then
  echo "[build-frontend] Skipping frontend build."

  # Create minimal fake frontend to allow tests to pass:
  mkdir -p dist
  echo > dist/blank.html
  echo > dist/favicon.ico
  echo > dist/index.html '<div id="app"></div>'

  exit
else
  npm clean-install --no-audit --fund=false --update-notifier=false
  npm run build
fi
