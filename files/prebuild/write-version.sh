#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags))"
  git submodule foreach --quiet '
    commit=$(git rev-parse HEAD)
    tag=$(git describe --tags)
    echo " $commit $name ($tag)"
  '
} > /tmp/version.txt
