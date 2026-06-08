#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

ulimit -n 4096

if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

export TAIGI_WEB_ADMIN_EMAIL="${TAIGI_WEB_ADMIN_EMAIL:-${ADMIN_EMAIL:-admin@example.com}}"
export TAIGI_WEB_PUBLIC_URL="${TAIGI_WEB_PUBLIC_URL:-${PUBLIC_URL:-http://127.0.0.1:8876}}"

exec "$PROJECT_ROOT/.venv/bin/uvicorn" taigi_web.server:app --host 0.0.0.0 --port 8876
