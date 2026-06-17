#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[fetch-frontend] $*"; }

filename="dist-$FRONTEND_VERSION.tar.gz"
releaseMetadataUrl="https://api.github.com/repos/$FRONTEND_REPO/releases/tags/$FRONTEND_VERSION"

log "Fetching release information from $releaseMetadataUrl ..."
expectedShaSum="$(
  node -e "
    const res = await fetch('$releaseMetadataUrl');
    const body = await res.json();
    const { assets } = body;
    const { digest } = assets.find(a => a.name === '$filename');
    const [ , sha256sum ] = digest.split(':', 2);
    console.log(sha256sum);
  "
)"

artifactUrl="https://github.com/$FRONTEND_REPO/releases/download/$FRONTEND_VERSION/$filename"
log "Fetching release artifact from $artifactUrl ..."
curl --location "$artifactUrl" -o "$filename"

log "Checking download hash..."
echo "$expectedShaSum $filename" | sha256sum --check

log "Extracting dist bundle..."
tar --extract --file "$filename"

log "Completed OK."
