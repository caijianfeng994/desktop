from __future__ import annotations

import os
import tempfile
from pathlib import Path

from desktop_robot.studio.glb_inspect import GlbError, GlbInfo, inspect_glb


class MakeItAnimatableError(Exception):
    pass


DEFAULT_SPACE = "jasongzy/Make-It-Animatable"


def _hf_token() -> str | None:
    return (
        os.environ.get("HF_TOKEN")
        or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        or os.environ.get("HUGGINGFACE_HUB_TOKEN")
        or None
    )


def _as_local_file(obj) -> Path | None:
    if obj is None:
        return None
    if isinstance(obj, (str, Path)):
        p = Path(obj)
        return p if p.is_file() else None
    if isinstance(obj, dict):
        for key in ("path", "name", "orig_name"):
            v = obj.get(key)
            if isinstance(v, str) and Path(v).is_file():
                return Path(v)
    return None


def _pick_animatable_bytes(outputs: tuple | list) -> tuple[bytes, GlbInfo]:
    """Prefer GLB among pipeline outputs; fall back to any readable mesh file that inspects as GLB."""
    candidates: list[Path] = []
    for item in outputs:
        p = _as_local_file(item)
        if p is not None:
            candidates.append(p)
    if not candidates:
        # Gradio sometimes returns empty update markers when ZeroGPU quota is exhausted
        raise MakeItAnimatableError(
            "Make-It-Animatable 未返回模型文件。常见原因：Hugging Face ZeroGPU 额度用尽。"
            "请在环境变量设置 HF_TOKEN（https://huggingface.co/settings/tokens），然后重试。"
        )

    glb_paths = [p for p in candidates if p.suffix.lower() == ".glb"]
    ordered = glb_paths + [p for p in candidates if p not in glb_paths]
    last_err: Exception | None = None
    for p in ordered:
        raw = p.read_bytes()
        if not raw.startswith(b"glTF"):
            continue
        try:
            info = inspect_glb(raw)
        except GlbError as e:
            last_err = e
            continue
        return raw, info
    raise MakeItAnimatableError(
        f"返回文件无法识别为可加载 GLB（候选 {[c.name for c in ordered]}）"
        + (f"：{last_err}" if last_err else "")
    )


def rig_glb_bytes(
    glb: bytes,
    *,
    space: str = DEFAULT_SPACE,
    timeout_s: float = 600.0,
    no_fingers: bool = True,
    retarget_animation: bool = True,
) -> tuple[bytes, GlbInfo]:
    """
    Call Hugging Face Make-It-Animatable Space to auto-rig a static GLB.

    Requires network + optional HF_TOKEN for ZeroGPU quota.
    """
    try:
        import httpx
        from gradio_client import Client, handle_file
    except ImportError as e:
        raise MakeItAnimatableError(
            "缺少依赖 gradio_client / httpx，请先 pip install gradio_client"
        ) from e

    token = _hf_token()
    tmp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
            f.write(glb)
            tmp = Path(f.name)

        client = Client(
            space,
            token=token,
            httpx_kwargs={"timeout": httpx.Timeout(timeout_s, connect=60.0)},
        )
        # /pipeline parameter order from Space API
        result = client.predict(
            handle_file(str(tmp)),
            no_fingers,  # No Fingers
            "No",  # Input Rest Pose (Trellis 姿势不定)
            [],  # Input Rest Parts
            False,  # Input is GS
            0.01,  # Opacity Threshold
            False,  # Use Normal
            True,  # Weight Post-Processing
            "LeftArm",  # Bone Name of Weight Visualization
            True,  # Reset to Rest
            None,  # Animation File → Space 默认动作（若有）
            retarget_animation,  # Retarget Animation to Character
            True,  # In Place
            api_name="/pipeline",
        )
        if not isinstance(result, (list, tuple)):
            result = (result,)
        return _pick_animatable_bytes(result)
    except MakeItAnimatableError:
        raise
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "ZeroGPU" in msg or "quota" in msg.lower():
            raise MakeItAnimatableError(
                "Hugging Face ZeroGPU 额度不足。"
                "请设置环境变量 HF_TOKEN 后重试："
                "https://huggingface.co/settings/tokens"
            ) from e
        raise MakeItAnimatableError(f"自动绑骨失败：{msg}") from e
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)
