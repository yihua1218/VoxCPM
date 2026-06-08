#!/bin/zsh
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

cd "$ROOT"

PRIVATE_USER="yi""hua"
PRIVATE_DOMAIN="${PRIVATE_USER}"".app"
PRIVATE_EMAIL="${PRIVATE_USER}1218""@gmail.com"
PRIVATE_TERMS=(
  "/Users/${PRIVATE_USER}"
  "$PRIVATE_EMAIL"
  "ai-mail""-butler"
  "taigi.${PRIVATE_DOMAIN}"
  "api-taigi.${PRIVATE_DOMAIN}"
  "static-taigi.${PRIVATE_DOMAIN}"
  "xn--kpr858j.${PRIVATE_DOMAIN}"
  "${PRIVATE_USER}/workspace"
)
PATTERN="$(IFS='|'; printf '(%s)' "${PRIVATE_TERMS[*]}")"

if rg -n --hidden --glob '!.git/**' --glob '!.env' --glob '!.env.*' "$PATTERN" .; then
  printf '\nPrivacy check failed: replace the matches above with env vars, placeholders, or example.com values.\n' >&2
  exit 1
fi

printf 'Privacy check passed.\n'
