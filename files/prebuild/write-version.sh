#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() {
  echo >&2 "[write-version] $*"
}

print_version() {
  printf ' %s %s (%s)\n' "$1" "$2" "$3"
}

git_version() {
  local path="$1"
  pushd "$path" >/dev/null
  commit="$(git rev-parse HEAD)"
  tag="$(git describe --tags --always)"
  print_version "$commit" "$path" "$tag"
  popd >/dev/null
}

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags --always))"

  if [[ "$FRONTEND_BUILD_MODE" = fetch ]] || [[ "$FRONTEND_BUILD_MODE" = test ]]; then
    print_version 0000000000000000000000000000000000000000 client "$FRONTEND_VERSION"
  elif [[ "$FRONTEND_BUILD_MODE" = source ]]; then
    if ! [[ -d ./client/.git ]]; then
      log "!!!"
      log "!!! No frontend git repository found at ./client/.git"
      log "!!!"
      log "!!! Make sure this directory is present, or change FRONTEND_BUILD_MODE."
      log "!!!"
      exit 1
    fi

    git_version client
  else
    log "!!!"
    log "!!! Unrecognised FRONTEND_BUILD_MODE: '$FRONTEND_BUILD_MODE'"
    log "!!!"
    exit 1
  fi

  git_version server

} > /tmp/version.txt
