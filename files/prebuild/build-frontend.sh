#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

cd client

if [[ ${SKIP_FRONTEND_BUILD-} != "" ]]; then
  echo "[build-frontend] Skipping frontend build."

  # Create minimal fake frontend to allow tests to pass:
  mkdir dist dist/css dist/fonts dist/js
  echo > dist/blank.html
  echo > dist/favicon.ico
  echo > dist/index.html '<div id="app"></div>'

  echo > dist/css/app.7f75100b.css
  echo > dist/css/component-feedback-button.9b267cf5.css
  echo > dist/css/component-home-config-section.86dc3b10.css
  echo > dist/css/component-home.7fd2ac91.css
  echo > dist/css/component-hover-cards.f8d67159.css
  echo > dist/css/component-outdated-version.1669dac3.css
  echo > dist/fonts/icomoon.ttf
  echo > dist/js/1272.6c131f2a.js
  echo > dist/js/247.f8ae2d8d.js
  echo > dist/js/3647.e6884fb5.js
  echo > dist/js/9342.c7b5e54f.js
  echo > dist/js/app.186f7291.js
  echo > dist/js/chunk-vendors.37e8929b.js
  echo > dist/js/component-feedback-button.0447c840.js
  echo > dist/js/component-home-config-section.04391182.js
  echo > dist/js/component-home.0f5945af.js
  echo > dist/js/component-hover-cards.957b7e0e.js
  echo > dist/js/component-outdated-version.17283d89.js

  exit
else
  npm clean-install --no-audit --fund=false --update-notifier=false
  npm run build
fi
