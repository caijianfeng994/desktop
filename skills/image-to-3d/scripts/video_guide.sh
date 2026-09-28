#!/usr/bin/env bash
# 无花费：用视频模型调试 Luxin CLI
set -euo pipefail
PROMPT="${1:-robot waving hello, short clip for studio preview}"
export npm_config_update_notifier=false
exec npx -y luxin-cli@latest video create --guide \
  --model fal.ltx-video-13b-distilled \
  --prompt "$PROMPT" \
  --json
