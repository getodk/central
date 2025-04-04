#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

{ echo "versions:"; echo "$(git rev-parse HEAD) ($(git describe --tags))"; git submodule; } > /tmp/version.txt
