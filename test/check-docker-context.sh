#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo "[$(basename "$0")] $*"; }

# See: https://stackoverflow.com/questions/38946683/

usage() {
  cat <<EOF
    USAGE
      $0 --report
      $0 [--min-size NUM --max-size NUM | --skip-size] [--min-count NUM --max-count NUM | --skip-count]
EOF
}

if [[ $# = 0 ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help) usage; exit;;

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

log "Creating custom docker build driver..."
# Use custom builder to prevent log truncation:
# > output clipped, log limit 200KiB/s reached
docker buildx rm docker_context_checker || true
docker buildx create --name docker_context_checker \
    --driver-opt env.BUILDKIT_STEP_LOG_MAX_SIZE=-1 \
    --driver-opt env.BUILDKIT_STEP_LOG_MAX_SPEED=-1
docker buildx use docker_context_checker

log "Building docker image..."
(
docker \
    buildx build --load \
    --no-cache --progress plain --file - . 2>&1 <<EOF
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

  /exporting config/ { image_hash=$4 }

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

log "File count: $file_count"
if [[ "${skip_count-}" != "true" ]]; then
  if [[ "$file_count" -lt "$min_count" ]] || [[ "$file_count" -gt "$max_count" ]]; then
    throw_err "This is a surprising number of files - expected between $min_count and $max_count"
  fi
fi

human_size() {
  if [[ "$1" -gt 999999 ]]; then
    echo "$(bc <<< "scale=3; $1 / 1000000") GB"
  else
    echo "$(bc <<< "scale=3; $1 / 1000") MB"
  fi
}

log "Total size: $(human_size "$total_size")"
if [[ "${skip_size-}" != "true" ]]; then
  # N.B. busybox `du` outputs in kB
  # See: https://www.busybox.net/downloads/BusyBox.html#du
  if [[ "$total_size" -lt $min_size ]]; then
    throw_err "This is a surprisingly small total size (expected min: $(human_size "$min_size"))"
  elif [[ "$total_size" -gt $max_size ]]; then
    throw_err "This is a surprisingly large total size (expected max: $(human_size "$max_size"))"
  fi
fi

cleanup
log "Everything looks OK."
