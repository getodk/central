#!/bin/bash -eu
set -o pipefail

log() { echo "[release] $*"; }

# TODO check git is clean & up-to-date with remote
# TODO try to divine version
# TODO confirm version with user
# TODO check entered version format is valid

sed -E \
    -e "s_'ghcr.io/getodk/central-nginx:.*'_'ghcr.io/getodk/central-nginx:$newVersion'_" \
    -e "s_'ghcr.io/getodk/central-service:.*'_'ghcr.io/getodk/central-service:$newVersion'_" \
		docker-compose.yml > "$tmpfile"
mv "$tmpfile" docker-compose.yml

git add docker-compose.yml
git commit -m"Release version: $newVersion"
git tag "$newVersion"

log "Pushing release to git..."
git push && git push --tags

log "Release complete.  Check build progress at:"
log ""
log "  https://github.com/getodk/central/actions"
echo
