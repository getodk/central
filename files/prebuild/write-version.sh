#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

print_version() {
  printf ' %s %s (%s)\n' "$1" "$2" "$3"
}

git_version() {
  local path="$1"
  cd "$path"
  commit="$(git rev-parse HEAD)"
  tag="$(git describe --tags --always)"
  print_version "$commit" "$path" "$tag"
  cd -
}

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags --always))"

  if [[ "$FRONTEND_BUILD_MODE" = fetch ]] || [[ "$FRONTEND_BUILD_MODE" = test ]]; then
    print_version 0000000000000000000000000000000000000000 client "$FRONTEND_VERSION"
  elif [[ "$FRONTEND_BUILD_MODE" = classic ]]; then
    git_version client
  else
    echo >&2 "!!!"
    echo >&2 "!!! Unrecognised FRONTEND_BUILD_MODE: '$FRONTEND_BUILD_MODE'"
    echo >&2 "!!!"
    exit 1
  fi

  git_version server

} > /tmp/version.txt
