#!/bin/bash -eu
set -o pipefail
shopt -s inherit_errexit

log() { echo >&2 "[$(basename "$0")] $*"; }

docker_compose() {
  docker compose --file nginx.test.docker-compose.yml "$@"
}

lint_service() {
  local service="$1"
  log "$service: checking config..."
  docker_compose exec "$service" bash -euc '
    echo "[lint-config] installing python..."
    apt update
    apt install -y python3-venv
    python3 -m venv .venv
    . .venv/bin/activate

    echo "[lint-config] installing semgrep..."
    pip install semgrep
    cat >.semgrep.yml <<EOF
rules:
  - id: nginx-add-header-missing-always
    languages: [generic]
    message: "Security headers should include \`always\` param to ensure they are sent with error responses (4xx, 5xx)."
    severity: ERROR
    patterns:
      - pattern-regex: "\\\\badd_header\\\\s+(Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options|Content-Security-Policy|Content-Security-Policy-Report-Only)\\\\s+.*"
      - pattern-not-regex: "(?i)add_header\\\\s+.*\\\\balways\\\\b\\\\s*;"
EOF
    echo "[lint-config] running semgrep..."
    semgrep scan --verbose \
                 --error \
                 --severity ERROR \
                 --metrics=off \
                 --disable-version-check \
                 --no-git-ignore \
                 --config p/nginx \
                 --config .semgrep.yml \
                 -- \
                 /etc/nginx/conf.d/odk.conf \
                 /usr/share/odk/nginx/

    # gixy-ng is a maintained fork of gixy: https://github.com/dvershinin/gixy
    # For version updates, see: https://pypi.org/project/gixy-ng/#history
    echo "[lint-config] installing gixy..."
    pip install gixy-ng==0.2.34
    echo "[lint-config] running gixy..."
    gixy -lll

    echo "[lint-config] All completed OK."
  '

  log "$service: config looks OK."
}

lint_service nginx-ssl-selfsign
lint_service nginx-ssl-upstream

log "Completed OK."
