import json
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

import pytest

from desktop_robot.hardware.types import HardwareAssembly, MountedComponent
from desktop_robot.passport.generate import generate_robot
from desktop_robot.passport.publication import (
    PublicationConflict,
    claim_publication,
    list_publications,
    load_publication,
    publish_robot,
)
from desktop_robot.studio.http_server import make_server


def _post(port: int, path: str, payload: dict) -> dict:
    request = Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def _robot(data_root: Path):
    assembly = HardwareAssembly(
        board_id="board.pi-zero-2w",
        components=[
            MountedComponent(
                instance_id="audio-1",
                component_id="audio.usb-combo",
                slot_id="body.audio",
            ),
            MountedComponent(
                instance_id="power-1",
                component_id="power.usb-15w",
                slot_id="body.power",
            ),
        ],
    )
    return generate_robot(
        data_root=data_root,
        name="待制作乐乐",
        route="custom",
        skill_ids=["chat.base", "memory.base", "sense.listen"],
        hardware=assembly,
    )


def test_publication_persists_snapshot_and_claimant(tmp_path: Path):
    passport = _robot(tmp_path)
    publication = publish_robot(tmp_path, passport)

    assert publication.status == "pending"
    assert publication.hardware["board"]["name"] == "Raspberry Pi Zero 2 W"
    assert [part["component"]["name"] for part in publication.hardware["components"]] == [
        "USB 麦克风喇叭",
        "5V 3A 电源",
    ]
    assert [skill["name"] for skill in publication.software["skills"]] == [
        "基础对话",
        "基础记忆",
        "听一听",
    ]
    assert publish_robot(tmp_path, passport).publication_id == publication.publication_id
    assert list_publications(tmp_path)[0]["status"] == "pending"

    claimed = claim_publication(tmp_path, publication.publication_id, "小王")
    assert claimed.status == "in_progress"
    assert claimed.claimant_name == "小王"
    assert load_publication(tmp_path, publication.publication_id).claimant_name == "小王"
    assert list_publications(tmp_path)[0]["claimant_name"] == "小王"
    assert claim_publication(tmp_path, publication.publication_id, "小王").status == "in_progress"
    with pytest.raises(PublicationConflict, match="已被 小王 领取"):
        claim_publication(tmp_path, publication.publication_id, "小李")


def test_publication_http_flow_and_pages(tmp_path: Path):
    passport = _robot(tmp_path)
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        published = _post(port, f"/api/robot/{passport.robot_id}/publish", {})
        publication_id = published["publication"]["publication_id"]
        assert published["publication"]["status"] == "pending"
        assert published["publication_url"].startswith("/publish.html?published=")

        with urlopen(f"http://127.0.0.1:{port}/api/publications", timeout=5) as response:
            listing = json.loads(response.read().decode("utf-8"))
        assert listing["publications"][0]["robot_name"] == "待制作乐乐"
        assert listing["publications"][0]["status"] == "pending"

        with urlopen(f"http://127.0.0.1:{port}/api/publications/{publication_id}", timeout=5) as response:
            detail = json.loads(response.read().decode("utf-8"))
        assert detail["publication"]["hardware"]["components"]
        assert detail["publication"]["software"]["skills"]

        claimed = _post(port, f"/api/publications/{publication_id}/claim", {"claimant_name": "制作人阿杰"})
        assert claimed["publication"]["status"] == "in_progress"
        assert claimed["publication"]["claimant_name"] == "制作人阿杰"

        for page in ("/publish.html", "/publish-detail.html"):
            with urlopen(f"http://127.0.0.1:{port}{page}", timeout=5) as response:
                assert response.status == 200
                assert "发布" in response.read().decode("utf-8")
    finally:
        server.shutdown()
