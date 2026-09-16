import json
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

from desktop_robot.studio.http_server import make_server


ASSEMBLY = {
    "target_mode": "physical",
    "board_id": "board.pi-zero-2w",
    "components": [
        {"instance_id": "audio-1", "component_id": "audio.usb-combo", "slot_id": "body.audio"},
        {"instance_id": "power-1", "component_id": "power.usb-15w", "slot_id": "body.power"},
    ],
}


def post(port: int, path: str, payload: dict) -> dict:
    req = Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def test_hardware_catalog_validate_wire_and_draft_api(tmp_path: Path):
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        with urlopen(f"http://127.0.0.1:{port}/api/hardware/catalog", timeout=5) as response:
            catalog = json.loads(response.read().decode("utf-8"))
        assert catalog["ok"] is True
        assert len(catalog["boards"]) >= 3
        assert any(item["id"] == "audio.usb-combo" for item in catalog["components"])

        checked = post(port, "/api/assembly/validate", {"assembly": ASSEMBLY})
        assert checked["validation"]["valid"] is True

        wired = post(port, "/api/assembly/auto-wire", {"assembly": ASSEMBLY})
        assert wired["ok"] is True
        assert wired["connections"]

        exported = post(
            port,
            "/api/assembly/design-export",
            {"robot_name": "Desk Friend", "assembly": ASSEMBLY},
        )
        assert exported["ok"] is True
        assert exported["provisional"] is True
        assert exported["manifest"]["robot_name"] == "desk_friend"
        assert '<robot name="desk_friend">' in exported["urdf"]

        saved = post(port, "/api/assembly/save", {"assembly": ASSEMBLY, "name": "草稿"})
        assert saved["ok"] is True
        with urlopen(
            f"http://127.0.0.1:{port}/api/assembly/draft/{saved['draft_id']}",
            timeout=5,
        ) as response:
            draft = json.loads(response.read().decode("utf-8"))
        assert draft["data"]["name"] == "草稿"
    finally:
        server.shutdown()


def test_draft_save_preserves_engineering_fields(tmp_path: Path):
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        first = post(
            port,
            "/api/assembly/save",
            {
                "assembly": {
                    **ASSEMBLY,
                    "components": [{
                        **ASSEMBLY["components"][0],
                        "x": 15,
                        "y": 25,
                        "position_mm": [10, 20, 30],
                        "rotation_rpy_deg": [0, 0, 90],
                    }],
                },
                "design_status": "ready",
                "track": "design",
            },
        )
        post(
            port,
            "/api/assembly/save",
            {
                "draft_id": first["draft_id"],
                "assembly": {
                    **ASSEMBLY,
                    "components": [{
                        **ASSEMBLY["components"][0],
                        "x": 55,
                        "y": 65,
                    }],
                },
                "name": "形象轨再次保存",
            },
        )
        with urlopen(
            f"http://127.0.0.1:{port}/api/assembly/draft/{first['draft_id']}",
            timeout=5,
        ) as response:
            saved = json.loads(response.read().decode("utf-8"))["data"]
        component = saved["assembly"]["components"][0]
        assert component["x"] == 55
        assert component["position_mm"] == [10, 20, 30]
        assert component["rotation_rpy_deg"] == [0, 0, 90]
        assert saved["design_status"] == "ready"
    finally:
        server.shutdown()
