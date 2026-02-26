#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

not_rel() {
  log "  Submodule targets not relevant: $*"
  log "Skipping submodule checks."
  exit
}

check_submodules() {
  local actualClientSubmodule
  local actualServerSubmodule
  local expectedClientSubmodule
  local expectedServerSubmodule

  actualClientSubmodule="$(git config --file .gitmodules --get submodule.client.url)"
  actualServerSubmodule="$(git config --file .gitmodules --get submodule.server.url)"

  expectedClientSubmodule=https://github.com/getodk/central-frontend.git
  expectedServerSubmodule=https://github.com/getodk/central-backend.git

  if ! [[ "$actualClientSubmodule" = "$expectedClientSubmodule" ]]; then
    log "!!!"
    log "!!! client submodule is pointing to unexpected repo:"
    log "!!!"
    log "!!!       actual: $actualClientSubmodule"
    log "!!!     expected: $expectedClientSubmodule"
    log "!!!"
    exit 1
  fi

  if ! [[ "$actualServerSubmodule" = "$expectedServerSubmodule" ]]; then
    log "!!!"
    log "!!! server submodule is pointing to unexpected repo:"
    log "!!!"
    log "!!!       actual: $actualServerSubmodule"
    log "!!!     expected: $expectedServerSubmodule"
    log "!!!"
    exit 1
  fi

  log "All submodules look OK."
}

log "Checking if running in CI..."
log "  CI=${CI-}"
if ! [[ ${CI-} = true ]]; then
  not_rel "not running in CI."
fi

log "Checking if running in GitHub Actions..."
log "  GITHUB_JOB=${GITHUB_JOB-}"
if [[ -z "${GITHUB_JOB-}" ]]; then
  not_rel "not running in GitHub Actions."
fi

log "Checking current repo..."
log "  GITHUB_REPOSITORY=$GITHUB_REPOSITORY"
if ! [[ "$GITHUB_REPOSITORY" = getodk/central ]]; then
  not_rel "not running in canonical repository."
fi

log "Checking current branch/PR target..."
log "  GITHUB_BASE_REF=$GITHUB_BASE_REF"
log "  GITHUB_REF_NAME=$GITHUB_REF_NAME"
if   [[ $GITHUB_BASE_REF = master ]] || [[ $GITHUB_BASE_REF = next ]]; then
  log "PR to merge to '$GITHUB_BASE_REF'; checking submodules..."
  check_submodules
elif [[ $GITHUB_REF_NAME = master ]] || [[ $GITHUB_REF_NAME = next ]]; then
  log "Running on protected branch '$GITHUB_REF_NAME'; checking submodules..."
  check_submodules
else
  not_rel "not running in a protected environment."
fi
