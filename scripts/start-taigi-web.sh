#!/bin/zsh
set -euo pipefail

cd /Users/yihua/workspace/voxcpm-project/VoxCPM

if [ -f /Users/yihua/workspace/ai-mail-butler/.env ]; then
  set -a
  source /Users/yihua/workspace/ai-mail-butler/.env
  set +a
fi

export TAIGI_WEB_ADMIN_EMAIL="${ADMIN_EMAIL:-yihua1218@gmail.com}"
export TAIGI_WEB_PUBLIC_URL="${TAIGI_WEB_PUBLIC_URL:-https://taigi.yihua.app}"

exec /Users/yihua/workspace/voxcpm-project/VoxCPM/.venv/bin/uvicorn taigi_web.server:app --host 0.0.0.0 --port 8876
