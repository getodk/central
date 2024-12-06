#!/bin/bash -eu
set -o pipefail
log() { echo "[$(basename "$0")] $*"; }

# See: https://stackoverflow.com/a/71751097

while [[ $# -gt 0 ]]; do
  case "$1" in
    --report) skip_size=true; skip_count=true ;;

    --min-size)   shift;min_size="$1" ;;
    --max-size)   shift;max_size="$1" ;;
    --skip-size)  skip_size=true ;;

    --min-count)  shift;min_count="$1" ;;
    --max-count)  shift;max_count="$1" ;;
    --skip-count) skip_count=true ;;

    *) log "!!! Unrecognised arg: $1"; exit 1 ;;
  esac
  shift
done

tmp="$(mktemp)"

log "Building docker image..."
(
docker build --no-cache --progress plain --file - . 2>&1 <<EOF
FROM busybox
COPY . /build-context
WORKDIR /build-context
RUN find . -type f
RUN du -s .
EOF
) | tee "$tmp"

vars="$(awk '
  / DONE / { stage="" }

  /RUN find \./ { stage="files" }
  /RUN du -s .$/ { stage="size" }

  stage == "files" { ++file_count }
  stage == "size"  { total_size=$3 }

  /writing image/ { image_hash=$4 }

  END {
    print "file_count: " file_count "\n"
    print "total_size: " total_size "\n"
    print "image_hash: " image_hash "\n"
  }
' "$tmp")"


file_count="$(echo "$vars" | grep file_count | cut -d: -f2)"
total_size="$(echo "$vars" | grep total_size | cut -d: -f2)"
docker_img="$(echo "$vars" | grep image_hash | cut -d: -f3)"

cleanup() {
  log "Removing docker image..."
  docker image rm "$docker_img" >/dev/null
}
throw_err() {
  log "!!!"
  log "!!! $* !!!"
  log "!!!"
  cleanup
  exit 1
}

for_humans() {
  local size="$1"
  if [[ "$size" -gt 999999 ]]; then
    log "$((size / 1000000)) GB"
  else
    log "$((size / 1000)) MB"
  fi
}

log "File count: $file_count"
if [[ "${skip_count-}" != "true" ]]; then
  if [[ "$file_count" -lt "$min_count" ]] || [[ "$file_count" -gt "$max_count" ]]; then
    throw_err "This is a surprising number of files - expected between $min_count and $max_count"
  fi
fi

log "Total size: $(for_humans "$total_size")"
if [[ "${skip_size-}" != "true" ]]; then
  # N.B. busybox `du` outputs in kB
  # See: https://www.busybox.net/downloads/BusyBox.html#du
  expected="- expected between $(for_humans "$min_size") and $(for_humans "$max_size")"
  if [[ "$total_size" -lt "$min_size" ]]; then
    throw_err "This is a surprisingly small total size $expected"
  elif [[ "$total_size" -gt "$max_size" ]]; then
    throw_err "This is a surprisingly large total size $expected"
  fi
fi

cleanup
log "Everything looks OK."
