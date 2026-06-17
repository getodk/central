#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

{
  echo "versions:"
  echo "$(git rev-parse HEAD) ($(git describe --tags --always))"
  echo " 0000000000000000000000000000000000000000 client ($FRONTEND_VERSION)"
  git submodule foreach --quiet --recursive \
    "commit=\$(git rev-parse HEAD); \
     tag=\$(git describe --tags --always); \
     printf ' %s %s (%s)\n' \"\$commit\" \"\$path\" \"\$tag\""
} > /tmp/version.txt
