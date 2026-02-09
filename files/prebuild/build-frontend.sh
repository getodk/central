#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

cd client

if [[ ${SKIP_FRONTEND_BUILD-} != "" ]]; then
  echo "[build-frontend] Skipping frontend build."

  # Create minimal fake frontend to allow tests to pass:
  mkdir dist dist/assets dist/fonts
  echo > dist/blank.html
  echo > dist/favicon.ico
  echo > dist/index.html '<div id="app"></div>'

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

  exit
else
  npm clean-install --no-audit --fund=false --update-notifier=false
  npm run build
fi
