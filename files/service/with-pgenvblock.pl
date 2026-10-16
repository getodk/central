#!/bin/bash -eu
set -o pipefail

if [[ $# -lt 2 ]]; then
  echo "Not enough arguments."
  echo "Usage: $0 [path-to-envblock] [program] [program-arg]..."
  usage 1
fi

envFile="$1"
shift

exec grep --null-data "^PG" "$envFile" |
    xargs --null \
    env \
        --ignore-environment \
        "$@"
