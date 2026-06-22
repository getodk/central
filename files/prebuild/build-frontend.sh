#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[build-frontend] $*"; }

if [[ $FRONTEND_BUILD_MODE = test ]]; then
  log "Building mock frontend..."

  # Create minimal fake frontend to allow tests to pass:
  mkdir dist dist/assets dist/fonts dist/apps dist/apps/forms
  echo > dist/blank.html
  echo > dist/index.html '<div id="root-app"></div>'
  echo > dist/android-chrome-192x192.png
  echo > dist/android-chrome-512x512.png
  echo > dist/apple-touch-icon.png
  echo > dist/favicon-16x16.png
  echo > dist/favicon-32x32.png
  echo > dist/favicon.ico
  echo > dist/apps/forms/index.html '<div id="form-wrapper"></div>'
  echo > dist/site.webmanifest

  echo > dist/assets/actor-link-CHKNLRJ6.js
  echo > dist/assets/branch-data-NQSuaxke.js
  echo > dist/assets/breadcrumbs-P9Q8Sr8V.js
  echo > dist/assets/chunky-array-CWqL2QBf.js
  echo > dist/assets/style-BAOwY-Kl.css
  echo > dist/assets/who-va@2x-KiG_UkDd.jpg
  echo > dist/assets/socio-economic@2x-DT8M7CaZ.jpg
  echo > dist/fonts/icomoon.ttf

  generateFile() {
    local name="$1"
    local size="$2"

    for ((x="$size"; x>0; x-=16)); do
      printf 0123456789abcdef >> dist/"$name"
    done
  }

  generateFile 10k-file.txt 10240
elif [[ $FRONTEND_BUILD_MODE = source ]]; then
  log "Building frontend from source..."

  if ! [[ -f client/package.json ]]; then
    log "!!!"
    log "!!! No frontend repository found at ./client"
    log "!!!"
    log "!!! Make sure this directory is present, or change FRONTEND_BUILD_MODE."
    log "!!!"
    exit 1
  fi

  cd client

  npm clean-install --no-audit --fund=false --update-notifier=false
  NODE_OPTIONS="--max-old-space-size=2048" npm run build

  mv dist ..
elif [[ $FRONTEND_BUILD_MODE = fetch ]]; then
  log "Fetching pre-built frontend..."

  filename="dist-$FRONTEND_VERSION.tar.gz"

  artifactUrl="https://github.com/getodk/central-frontend/releases/download/$FRONTEND_VERSION/$filename"
  log "Fetching release artifact from $artifactUrl ..."
  curl \
      --connect-timeout 60 \
      --fail \
      --retry 5 \
      --retry-delay 10 \
      --retry-all-errors \
      --location "$artifactUrl" \
      --output "$filename"

  log "Extracting dist bundle..."
  tar --extract --file "$filename"
else
  log "!!!"
  log "!!! Unrecognised FRONTEND_BUILD_MODE: '$FRONTEND_BUILD_MODE'"
  log "!!!"
  exit 1
fi

log "Completed OK."
