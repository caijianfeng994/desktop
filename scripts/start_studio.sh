#!/usr/bin/env bash
# 启动桌面机器人装配台 Studio（形象轨 / 结构设计）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOST="${STUDIO_HOST:-127.0.0.1}"
PORT="${STUDIO_PORT:-8765}"
DATA="${STUDIO_DATA:-./data}"

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHON="$ROOT/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
else
  PYTHON="python"
fi

echo "打开 http://${HOST}:${PORT}/ 选择创作路线"
exec "$PYTHON" -m desktop_robot.studio --host "$HOST" --port "$PORT" --data "$DATA"
