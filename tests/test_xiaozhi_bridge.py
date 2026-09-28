import threading

import httpx

from desktop_robot.body.types import BodyCommand
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody
from desktop_robot.bridge.backends import LogBackend
from desktop_robot.bridge.dispatch import dispatch
from desktop_robot.bridge.http_server import make_server


def test_speak_records_text():
    b = LogBackend()
    status, body = dispatch("/v1/speak", {"text": "你好"}, b)
    assert status == 200
    assert body == {"ok": True}
    assert b.history[-1] == ("speak", {"text": "你好"})


def test_face_and_look():
    b = LogBackend()
    assert dispatch("/v1/face", {"face": "happy"}, b)[0] == 200
    assert dispatch("/v1/look", {"yaw": 20, "pitch": 0}, b)[0] == 200
    assert b.history[0][0] == "set_face"
    assert b.history[1] == ("look", {"yaw": 20.0, "pitch": 0.0})


def test_missing_text_is_400():
    status, body = dispatch("/v1/speak", {}, LogBackend())
    assert status == 400
    assert body["ok"] is False
    assert "missing_text" in body["reason"]


def test_unknown_path_404():
    status, body = dispatch("/v1/nope", {}, LogBackend())
    assert status == 404
    assert body["ok"] is False


def test_xiaozhi_http_body_against_local_bridge():
    backend = LogBackend()
    server = make_server("127.0.0.1", 0, backend)
    host, port = server.server_address[:2]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = httpx.Client(base_url=f"http://{host}:{port}", timeout=5.0)
        body = XiaozhiHttpBody(client=client)
        r = body.execute(BodyCommand(action="speak", payload={"text": "hi"}))
        assert r.ok is True
        assert backend.history[-1][0] == "speak"
    finally:
        server.shutdown()
