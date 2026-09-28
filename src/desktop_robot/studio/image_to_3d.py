from __future__ import annotations

import json
import os
import subprocess
import tempfile
import urllib.request
from pathlib import Path

MAX_AVATAR_BYTES = 5 * 1024 * 1024


class ImageTo3DError(Exception):
    pass


def validate_image_bytes(raw: bytes) -> None:
    if not raw:
        raise ImageTo3DError("图片为空")
    if len(raw) > MAX_AVATAR_BYTES:
        raise ImageTo3DError("图片不能超过 5MB")
    ok = (
        raw.startswith(b"\x89PNG\r\n\x1a\n")
        or raw.startswith(b"\xff\xd8\xff")
        or raw.startswith(b"GIF87a")
        or raw.startswith(b"GIF89a")
        or (len(raw) >= 12 and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP")
    )
    if not ok:
        raise ImageTo3DError("只支持 PNG / JPEG / WebP / GIF")


def _last_json_object(text: str) -> dict:
    decoder = json.JSONDecoder()
    idx = 0
    last: dict | None = None
    while idx < len(text):
        while idx < len(text) and text[idx].isspace():
            idx += 1
        if idx >= len(text):
            break
        obj, end = decoder.raw_decode(text, idx)
        if isinstance(obj, dict):
            last = obj
        idx = end
    if last is None:
        raise ImageTo3DError("图生 3D 返回无法解析")
    return last


def _luxin(args: list[str], *, timeout: int) -> dict:
    env = os.environ.copy()
    env["npm_config_update_notifier"] = "false"
    # 本机若配置了私有 npm 源，可能 403；拉 luxin-cli 时强制走官方 registry
    env.setdefault("npm_config_registry", "https://registry.npmjs.org")
    cmd = ["npx", "-y", "luxin-cli@latest", *args, "--json"]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
            check=False,
        )
    except FileNotFoundError as e:
        raise ImageTo3DError("本机没有 npx，无法图生 3D") from e
    except subprocess.TimeoutExpired as e:
        raise ImageTo3DError("图生 3D 超时，请稍后重试") from e
    blob = (proc.stdout or "") + "\n" + (proc.stderr or "")
    try:
        data = _last_json_object(proc.stdout or "")
    except ImageTo3DError:
        raise ImageTo3DError((proc.stderr or proc.stdout or "图生 3D 失败")[:300]) from None
    if not data.get("ok"):
        err = data.get("error") or {}
        msg = err.get("message") if isinstance(err, dict) else str(err or blob[-300:])
        raise ImageTo3DError(msg or "图生 3D 失败")
    return data


def _ssl_context():
    """macOS 系统 Python 常缺根证书；优先用 certifi，避免 CERTIFICATE_VERIFY_FAILED。"""
    import ssl

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "desktop-robot/1"})
    try:
        with urllib.request.urlopen(req, context=_ssl_context(), timeout=60) as resp:
            body = resp.read()
    except Exception as e:  # noqa: BLE001
        raise ImageTo3DError(f"下载 GLB 失败: {e}") from e
    if not body.startswith(b"glTF"):
        raise ImageTo3DError("下载的不是 GLB 模型")
    return body


def image_bytes_to_glb(raw: bytes) -> bytes:
    """Upload a photo via Luxin Trellis and return GLB bytes."""
    validate_image_bytes(raw)
    suffix = ".png"
    if raw.startswith(b"\xff\xd8\xff"):
        suffix = ".jpg"
    elif raw.startswith(b"RIFF"):
        suffix = ".webp"
    elif raw.startswith(b"GIF"):
        suffix = ".gif"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(raw)
        src = Path(tmp.name)
    try:
        uploaded = _luxin(["upload", str(src)], timeout=60)
        asset = ((uploaded.get("data") or {}).get("asset") or {})
        asset_id = asset.get("asset_id")
        if not asset_id:
            raise ImageTo3DError("图片上传失败")
        edited = _luxin(
            [
                "edit",
                "--input",
                str(asset_id),
                "--model",
                "fal.trellis-image-to-3d",
                "--max-estimated-usd-per-image",
                "0.04",
            ],
            timeout=180,
        )
        assets = (edited.get("data") or {}).get("assets") or []
        url = None
        for item in assets:
            if isinstance(item, dict) and (
                item.get("mime_type") == "model/gltf-binary" or str(item.get("url") or "").endswith(".glb")
            ):
                url = item.get("url") or item.get("path")
                break
        if not url:
            raise ImageTo3DError("没有返回 3D 模型地址")
        return _download(str(url))
    finally:
        src.unlink(missing_ok=True)
