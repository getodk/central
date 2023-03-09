#!/bin/bash -eu
cd client
npm clean-install --no-audit --fund=false --update-notifier=false
npm run build
