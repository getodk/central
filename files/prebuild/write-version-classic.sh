#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

git_version() {
  local path="$1"
  cd "$path"
  commit="$(git rev-parse HEAD)"
  tag="$(git describe --tags --always)"
  echo ' %s %s (%s)\n' "$commit" "$path" "$tag"
  cd -
}

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags --always))"
  git_version client
  git_version server
} > /tmp/version.txt
