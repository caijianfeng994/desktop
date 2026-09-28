#!/usr/bin/env python3
"""Run Luxin / image-skill CLI and summarize guide JSON for agents."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from typing import Any


def _cli() -> list[str]:
    # Image Skill 已更名为 Luxin；优先 luxin-cli，兼容旧 image-skill 包名提示
    if shutil.which("npx"):
        return ["npx", "-y", "luxin-cli@latest"]
    raise SystemExit("需要 Node.js / npx 才能调用 luxin-cli")


def run_cmd(args: list[str]) -> dict[str, Any]:
    env = os.environ.copy()
    env["npm_config_update_notifier"] = "false"
    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    try:
        payload = json.loads(stdout) if stdout else {}
    except json.JSONDecodeError:
        return {
            "ok": False,
            "parse_error": True,
            "stdout": stdout[-4000:],
            "stderr": stderr[-2000:],
            "returncode": proc.returncode,
        }
    if not isinstance(payload, dict):
        return {"ok": False, "raw": payload, "returncode": proc.returncode}
    payload.setdefault("returncode", proc.returncode)
    if stderr:
        payload["_stderr_tail"] = stderr[-1500:]
    return payload


def summarize(guide: dict[str, Any]) -> dict[str, Any]:
    data = guide.get("data") if isinstance(guide.get("data"), dict) else guide
    return {
        "stage": data.get("stage"),
        "next_command": data.get("next_command"),
        "no_spend_next_command": data.get("no_spend_next_command"),
        "guide_warning": data.get("guide_warning"),
        "auth_ready": data.get("auth_ready"),
        "keys": sorted(data.keys())[:40] if isinstance(data, dict) else [],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Luxin guide helper")
    parser.add_argument(
        "--mode",
        choices=["video-guide", "image-to-3d-guide"],
        default="video-guide",
        help="video-guide=视频模型无花费调试；image-to-3d-guide=Trellis guide",
    )
    parser.add_argument("--prompt", default=None)
    args = parser.parse_args()

    base = _cli()
    if args.mode == "video-guide":
        prompt = args.prompt or "robot waving hello, short clip for studio preview"
        # 模态优先写法 + 显式模型（调试用）
        cmd = base + [
            "video",
            "create",
            "--guide",
            "--model",
            "fal.ltx-video-13b-distilled",
            "--prompt",
            prompt,
            "--json",
        ]
    else:
        prompt = args.prompt or "turn one product photo into a textured 3d mesh"
        cmd = base + [
            "3d",
            "create",
            "--guide",
            "--model",
            "fal.trellis-image-to-3d",
            "--prompt",
            prompt,
            "--json",
        ]

    print("RUN:", " ".join(cmd), file=sys.stderr)
    result = run_cmd(cmd)
    # 若 video/3d 子命令不被识别，回退 create --guide
    if result.get("returncode", 1) != 0 and (
        result.get("parse_error")
        or "unknown" in str(result.get("stderr", "")).lower()
        or "Unknown" in str(result.get("_stderr_tail", ""))
    ):
        model = (
            "fal.ltx-video-13b-distilled"
            if args.mode == "video-guide"
            else "fal.trellis-image-to-3d"
        )
        prompt = args.prompt or (
            "robot waving hello, short clip for studio preview"
            if args.mode == "video-guide"
            else "turn one product photo into a textured 3d mesh"
        )
        cmd = base + [
            "create",
            "--guide",
            "--model",
            model,
            "--prompt",
            prompt,
            "--json",
        ]
        print("FALLBACK:", " ".join(cmd), file=sys.stderr)
        result = run_cmd(cmd)

    out = {"summary": summarize(result), "raw": result}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    raise SystemExit(0 if result.get("returncode", 1) == 0 or "data" in result else 1)


if __name__ == "__main__":
    main()
