#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="app.yihua.taigi-web"
TEMPLATE="$SCRIPT_DIR/${LABEL}.plist.template"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET="$TARGET_DIR/${LABEL}.plist"
USER_ID="$(id -u)"
PROJECT_ROOT_FOR_SED="${PROJECT_ROOT//&/\\&}"

mkdir -p "$TARGET_DIR"

sed "s#__PROJECT_ROOT__#${PROJECT_ROOT_FOR_SED}#g" "$TEMPLATE" > "$TARGET"
plutil -lint "$TARGET" >/dev/null

launchctl enable "gui/${USER_ID}/${LABEL}" 2>/dev/null || true

launchctl bootout "gui/${USER_ID}" "$TARGET" 2>/dev/null || true
launchctl bootstrap "gui/${USER_ID}" "$TARGET"
launchctl kickstart -k "gui/${USER_ID}/${LABEL}"

printf 'Installed and started %s from %s\n' "$LABEL" "$TARGET"
