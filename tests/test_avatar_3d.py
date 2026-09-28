import base64
from pathlib import Path
from threading import Thread

from desktop_robot.passport.store import avatar_glb_path
from desktop_robot.studio.http_server import StudioHandler, make_server
from desktop_robot.studio.image_to_3d import ImageTo3DError, validate_image_bytes


PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc``\x80\x00"
    b"\x00\x00\x02\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82"
)
FAKE_GLB = b"glTF" + b"\x00" * 12


def test_validate_png():
    validate_image_bytes(PNG_1X1)


def test_validate_rejects_garbage():
    try:
        validate_image_bytes(b"not-an-image")
    except ImageTo3DError:
        return
    raise AssertionError("expected ImageTo3DError")


def test_generate_without_image_is_geometric(tmp_path: Path):
    from desktop_robot.passport.generate import generate_robot

    p = generate_robot(data_root=tmp_path, name="几何", route="default")
    assert p.appearance_kind == "geometric"
    assert not avatar_glb_path(tmp_path, p.robot_id).exists()


def test_generate_with_image_saves_glb(tmp_path: Path, monkeypatch):
    def fake_convert(raw: bytes) -> bytes:
        assert raw.startswith(b"\x89PNG")
        return FAKE_GLB

    monkeypatch.setattr(StudioHandler, "convert_avatar", staticmethod(fake_convert))
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        import json
        from urllib.request import Request, urlopen

        port = server.server_address[1]
        payload = json.dumps(
            {
                "name": "拍照葱",
                "route": "default",
                "avatar_image_b64": base64.b64encode(PNG_1X1).decode("ascii"),
            }
        ).encode("utf-8")
        req = Request(
            f"http://127.0.0.1:{port}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        assert data["ok"] is True
        assert data["passport"]["appearance_kind"] == "glb"
        robot_id = data["passport"]["robot_id"]
        glb = avatar_glb_path(tmp_path, robot_id)
        assert glb.read_bytes() == FAKE_GLB
        with urlopen(f"http://127.0.0.1:{port}/api/robot/{robot_id}/avatar.glb", timeout=10) as resp:
            assert resp.read() == FAKE_GLB
    finally:
        server.shutdown()
