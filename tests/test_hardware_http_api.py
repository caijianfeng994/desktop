import json
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

from desktop_robot.passport.generate import generate_robot
from desktop_robot.studio.http_server import make_server


ASSEMBLY = {
    "target_mode": "physical",
    "board_id": "board.pi-zero-2w",
    "components": [
        {"instance_id": "audio-1", "component_id": "audio.usb-combo", "slot_id": "body.audio"},
        {"instance_id": "power-1", "component_id": "power.usb-15w", "slot_id": "body.power"},
    ],
}

# chat.base 需要音频，body.wave 需要 motion.servo.arm，生成护照时必须同时满足。
ARM_ASSEMBLY = {
    **ASSEMBLY,
    "components": [
        *ASSEMBLY["components"],
        {"instance_id": "arm-1", "component_id": "motion.arm-servo", "slot_id": "body.arm_right"},
    ],
}


def get_text(port: int, path: str) -> str:
    with urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as response:
        return response.read().decode("utf-8")


def post(port: int, path: str, payload: dict) -> dict:
    req = Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def test_dual_track_pages_are_served(tmp_path: Path):
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        index = get_text(port, "/")
        design = get_text(port, "/design.html")
        assert "选择创作路线" in index
        assert "形象与互动" in index
        assert "工程与制造" in index
        assert 'id="track-picker"' in index
        assert 'id="design-source"' in design
        assert "导出工程交接" in design
    finally:
        server.shutdown()


def test_design_page_contains_engineering_contract(tmp_path: Path):
    html = Path("src/desktop_robot/studio/static/design.html").read_text(encoding="utf-8")
    for field in (
        "dimensions_mm",
        "mass_g",
        "cad_query",
        "cad_source_url",
        "step_path",
        "mesh_path",
        "parent_frame",
        "position_mm",
        "rotation_rpy_deg",
        "joint.type",
        "joint.axis",
    ):
        assert field in html
    assert "布局数据不得用于 URDF" in html
    assert "/api/assembly/draft/" in html
    assert "/api/robot/" in html


def test_design_page_clears_invalid_engineering_facts():
    html = Path("src/desktop_robot/studio/static/design.html").read_text(encoding="utf-8")
    assert "catch (error) {\n        dimensions = null;" in html
    assert "mass_g: !form.elements.mass_g.classList.contains(\"invalid\") ? mass : null" in html
    assert "component.joint = null;" in html
    assert "assembly: state.assembly" in html
    for layout_field in ("component.x", "component.y", "component.z", "component.rotation", "component.scale"):
        assert f"position_mm = {layout_field}" not in html
        assert f"rotation_rpy_deg = {layout_field}" not in html


def test_track_picker_hides_studio_topbar_and_main():
    """选轨首屏必须同时收起旧顶栏，否则步骤导航和保存草稿会误改步骤或冲掉草稿。"""
    html = Path("src/desktop_robot/studio/static/index.html").read_text(encoding="utf-8")
    assert 'id="studio-topbar"' in html
    hide_both = '$("#studio-topbar").hidden = showTrackPicker;'
    assert hide_both in html
    assert 'document.querySelector("main.page").hidden = showTrackPicker;' in html
    assert '$("#studio-topbar").hidden = false;' in html
    assert 'document.querySelector("main.page").hidden = false;' in html
    assert "showStep(0);" in html
    # .topbar 的 display:flex 会盖掉 [hidden] 的 display:none，必须显式补规则。
    assert ".topbar[hidden] { display:none; }" in html


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


def test_draft_save_keeps_unsubmitted_parent_frame(tmp_path: Path):
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
                        "parent_frame": "head_link",
                    }],
                },
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
        assert component["parent_frame"] == "head_link"
    finally:
        server.shutdown()


def test_robot_hardware_update_does_not_change_skills_or_route(tmp_path: Path):
    robot = generate_robot(
        data_root=tmp_path,
        name="工程葱",
        route="custom",
        skill_ids=["chat.base", "body.wave"],
        hardware=ARM_ASSEMBLY,
    )
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        engineering = {
            **ARM_ASSEMBLY,
            "components": [{
                **ARM_ASSEMBLY["components"][0],
                "position_mm": [0, 0, 42],
                "rotation_rpy_deg": [0, 0, 0],
            }],
        }
        updated = post(
            port,
            f"/api/robot/{robot.robot_id}/hardware",
            {"assembly": engineering},
        )["passport"]
        assert updated["passport_rev"] == robot.passport_rev + 1
        assert updated["route"] == "custom"
        assert updated["installed_skill_ids"] == ["chat.base", "body.wave"]
        assert updated["hardware"]["components"][0]["position_mm"] == [0, 0, 42]
    finally:
        server.shutdown()


def test_draft_save_clears_engineering_field_when_explicitly_null(tmp_path: Path):
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
                        "position_mm": [10, 20, 30],
                    }],
                },
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
                        "position_mm": None,
                    }],
                },
            },
        )
        with urlopen(
            f"http://127.0.0.1:{port}/api/assembly/draft/{first['draft_id']}",
            timeout=5,
        ) as response:
            saved = json.loads(response.read().decode("utf-8"))["data"]
        assert saved["assembly"]["components"][0]["position_mm"] is None
    finally:
        server.shutdown()
