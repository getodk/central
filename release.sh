#!/bin/bash -eu
set -o pipefail

log() { echo "[release] $*"; }

log "Checking git branch..."
currentBranch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$currentBranch" != master ]]; then
  log "!!!"
  log "!!! Unexpected branch:"
  log "!!!   Expected: master"
  log "!!!     Actual: $currentBranch"
  log "!!!"
  exit 1
fi
log "  Git branch OK."

log "Checking for uncommitted changes..."
gitStatus="$(git status --porcelain)"
if [[ "$gitStatus" != "" ]]; then
  log "!!!"
  log "!!! Your working directory is dirty.  Make sure you have committed all changes."
  log "!!!"
  exit 1
fi
log "  No uncommitted changes found."

log "Checking for divergence from upstream..."
upstream="$(git rev-parse --abbrev-ref '@{upstream}')"
remote="${upstream%%/*}"
log "  Fetching from remote '$remote'..."
git fetch "$remote"
log "  Comparing to $upstream..."
if ! git diff --exit-code "$upstream"..HEAD; then
  log "!!!"
  log "!!! Differences found between HEAD and tracking branch $upstream !!!"
  log "!!!"
  log "!!! Do you need to git push?"
  log "!!!"
  exit 1
fi
log "  HEAD seems to be in-line with upstream."

year="$(date +%Y)"
if git tag | grep "^v$year\."; then
  lastMinor="$(git tag | grep "^v$year" | tail -n1 | cut -d'.' -f2)"
  suggestedVersion="v$year.$((lastMinor+1)).0"
else
  suggestedVersion="v$year.1.0"
fi
read -r -e \
    -p "[release] Version to release: " \
    -i "$suggestedVersion" newVersion
if ! [[ "$newVersion" = v*.*.* ]]; then
  log "!!!"
  log "!!! Version '$newVersion' does not match expected format."
  log "!!!"
  exit 1
fi

log "Updating version numbers in docker-compose.yml ..."
tmpfile="$(mktemp)"
sed -E \
    -e "s_(image:\s+'.*/.*/central-nginx):.*'_\1:$newVersion'_" \
    -e "s_(image:\s+'.*/.*/central-service):.*'_\1:$newVersion'_" \
    docker-compose.yml > "$tmpfile"
mv "$tmpfile" docker-compose.yml

log "Committing changes to git..."
git add docker-compose.yml
git commit -m"Release version: $newVersion"
git tag "$newVersion"

log "Pushing release to git..."
git push && git push --tags

echo
log "Release complete.  Check build progress at:"
log ""
log "  https://github.com/getodk/central/actions"
echo
