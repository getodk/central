#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags))"
  git submodule foreach --quiet --recursive \
    "commit=\$(git rev-parse HEAD); \
     tag=\$(git describe --tags); \
     printf ' %s %s (%s)\n' \"\$commit\" \"\$path\" \"\$tag\""
} > /tmp/version.txt
