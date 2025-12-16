#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags --always))"
  git submodule foreach --quiet --recursive \
    "commit=\$(git rev-parse HEAD); \
     tag=\$(git describe --tags --always); \
     printf ' %s %s (%s)\n' \"\$commit\" \"\$path\" \"\$tag\""
} > /tmp/version.txt
