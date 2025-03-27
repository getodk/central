#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[test/envsub] $*"; }

failCount=0

log "should correctly substitute provided values"
if diff <( \
  SIMPLE=sv_simple \
  SUBVAL_1=sub_val_one \
  SUBVAL_2=sub_val_two \
  ../../files/shared/envsub.awk \
< good-example.in
) good-example.expected; then
  log "  OK"
else
  ((++failCount))
  log "  FAILED"
fi

log "should correctly substitute provided EMPTY values"
if diff <( \
  SIMPLE="" \
  SUBVAL_1="" \
  SUBVAL_2="" \
  ../../files/shared/envsub.awk \
< good-example.in
) good-example.empty.expected; then
  log "  OK"
else
  ((++failCount))
  log "  FAILED"
fi


log "should fail when asked to substitute undefined value"
if ! ../../files/shared/envsub.awk <<<"\${NOT_DEFINED}" >/dev/null 2>/dev/null; then
  log "  OK"
else
  ((++failCount))
  log "  FAILED"
fi

log "should log all issues when asked to substitute multiple undefined values"
out="$(mktemp)"
err="$(mktemp)"
if ../../files/shared/envsub.awk < bad-example.in >"$out" 2>"$err"; then
  ((++failCount))
  log "  FAILED: expected non-zero status code"
elif ! diff "$out" bad-example.stdout.expected; then
  ((++failCount))
  log "  FAILED: generated stdout did not equal expected output"
elif ! diff "$err" bad-example.stderr.expected; then
  echo "err: $err"
  ((++failCount))
  log "  FAILED: generated stderr did not equal expected output"
else
  log "  OK"
fi

if [[ "$failCount" = 0 ]]; then
  log "All tests passed OK."
else
  log "$failCount TEST(S) FAILED"
  exit 1
fi
