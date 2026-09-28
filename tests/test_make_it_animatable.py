from __future__ import annotations

import json
import threading
from pathlib import Path
from urllib.request import Request, urlopen

import pytest

from desktop_robot.passport.store import save_avatar_glb, save_passport
from desktop_robot.passport.types import Passport
from desktop_robot.studio.glb_inspect import GlbInfo
from desktop_robot.studio.http_server import make_server
from desktop_robot.studio.make_it_animatable import (
    MakeItAnimatableError,
    _as_local_file,
    _pick_animatable_bytes,
)


def _minimal_glb(*, skins: bool = False, anims: bool = False) -> bytes:
    """Build a tiny valid GLB with optional skins/animations markers."""
    gltf: dict = {
        "asset": {"version": "2.0"},
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [],
        "bufferViews": [],
        "buffers": [{"byteLength": 0}],
    }
    if skins:
        gltf["skins"] = [{"joints": [0]}]
        gltf["nodes"] = [{"name": "root"}]
    if anims:
        gltf["animations"] = [{"name": "Idle", "channels": [], "samplers": []}]
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    pad = (4 - (len(js) % 4)) % 4
    js = js + (b" " * pad)
    total = 12 + 8 + len(js)
    return (
        b"glTF"
        + (2).to_bytes(4, "little")
        + total.to_bytes(4, "little")
        + len(js).to_bytes(4, "little")
        + b"JSON"
        + js
    )


def test_as_local_file(tmp_path: Path):
    p = tmp_path / "a.glb"
    p.write_bytes(b"x")
    assert _as_local_file(str(p)) == p
    assert _as_local_file({"path": str(p)}) == p
    assert _as_local_file({"__type__": "update"}) is None


def test_pick_animatable_bytes_prefers_glb(tmp_path: Path):
    glb = _minimal_glb(skins=True, anims=True)
    path = tmp_path / "out.glb"
    path.write_bytes(glb)
    raw, info = _pick_animatable_bytes([{"__type__": "update"}, str(path)])
    assert raw == glb
    assert info.animatable is True


def test_pick_animatable_bytes_empty_updates():
    with pytest.raises(MakeItAnimatableError, match="HF_TOKEN"):
        _pick_animatable_bytes([{"__type__": "update"}, {"__type__": "update"}])


def test_auto_rig_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    passport = Passport(
        robot_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name="测",
        route="default",
        status="ready",
        appearance_kind="glb",
        installed_skill_ids=["core.chat"],
    )
    save_passport(tmp_path, passport)
    static = _minimal_glb(skins=False, anims=False)
    save_avatar_glb(tmp_path, passport.robot_id, static)

    rigged = _minimal_glb(skins=True, anims=True)

    def fake_rig(glb: bytes, **kwargs):
        assert glb == static
        return rigged, GlbInfo(
            has_skins=True,
            animation_count=1,
            animation_names=("Idle",),
            mesh_count=1,
            byte_size=len(rigged),
        )

    monkeypatch.setattr(
        "desktop_robot.studio.http_server.rig_glb_bytes",
        fake_rig,
    )

    server = make_server("127.0.0.1", 0, tmp_path)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    try:
        req = Request(
            f"http://127.0.0.1:{port}/api/robot/{passport.robot_id}/auto-rig",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        assert data["ok"] is True
        assert data["skipped"] is False
        assert data["animatable"] is True
        assert data["animation_names"] == ["Idle"]
        bak = tmp_path / "robots" / passport.robot_id / "avatar.glb.static.bak"
        assert bak.is_file() and bak.read_bytes() == static
        assert (
            tmp_path / "robots" / passport.robot_id / "avatar.glb"
        ).read_bytes() == rigged

        with urlopen(req, timeout=10) as resp:
            data2 = json.loads(resp.read().decode("utf-8"))
        assert data2["ok"] is True
        assert data2["skipped"] is True
    finally:
        server.shutdown()
