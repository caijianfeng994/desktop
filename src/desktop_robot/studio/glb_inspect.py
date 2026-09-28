from __future__ import annotations

import json
import struct
from dataclasses import dataclass


class GlbError(Exception):
    pass


@dataclass(frozen=True)
class GlbInfo:
    has_skins: bool
    animation_count: int
    animation_names: tuple[str, ...]
    mesh_count: int
    byte_size: int

    @property
    def animatable(self) -> bool:
        return self.has_skins and self.animation_count > 0


def inspect_glb(data: bytes) -> GlbInfo:
    """Parse GLB header/JSON chunk enough to detect Mixamo-style skins + clips."""
    if len(data) < 20 or not data.startswith(b"glTF"):
        raise GlbError("不是有效的 GLB（缺少 glTF 头）")
    version = struct.unpack_from("<I", data, 4)[0]
    if version != 2:
        raise GlbError(f"仅支持 glTF 2.0 GLB，当前 version={version}")

    offset = 12
    json_obj: dict | None = None
    while offset + 8 <= len(data):
        chunk_len, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_len]
        offset += chunk_len
        if chunk_type == b"JSON":
            text = chunk.decode("utf-8", errors="replace").rstrip(" \x00")
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError as e:
                raise GlbError("GLB JSON 块无法解析") from e
            if not isinstance(parsed, dict):
                raise GlbError("GLB JSON 根节点无效")
            json_obj = parsed
            break
    if json_obj is None:
        raise GlbError("GLB 缺少 JSON 块")

    skins = json_obj.get("skins") or []
    anims = json_obj.get("animations") or []
    meshes = json_obj.get("meshes") or []
    names: list[str] = []
    for a in anims:
        if isinstance(a, dict) and a.get("name"):
            names.append(str(a["name"]))
        else:
            names.append("unnamed")
    return GlbInfo(
        has_skins=isinstance(skins, list) and len(skins) > 0,
        animation_count=len(anims) if isinstance(anims, list) else 0,
        animation_names=tuple(names),
        mesh_count=len(meshes) if isinstance(meshes, list) else 0,
        byte_size=len(data),
    )
