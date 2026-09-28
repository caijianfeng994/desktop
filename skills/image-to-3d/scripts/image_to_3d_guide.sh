#!/usr/bin/env bash
# 无花费：图生 3D guide（Trellis）
set -euo pipefail
PROMPT="${1:-turn one product photo into a textured 3d mesh}"
export npm_config_update_notifier=false
exec npx -y luxin-cli@latest 3d create --guide \
  --model fal.trellis-image-to-3d \
  --prompt "$PROMPT" \
  --json
