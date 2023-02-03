#!/bin/bash -eu
cd client
npm install --no-audit --fund=false --update-notifier=false
npm run build
