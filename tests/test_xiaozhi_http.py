import httpx

from desktop_robot.body.types import BodyCommand
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody


def test_speak_posts_json():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/speak"
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="http://test")
    body = XiaozhiHttpBody(client=client)
    r = body.execute(BodyCommand(action="speak", payload={"text": "hi"}))
    assert r.ok is True


def test_http_error_maps_fail():
    transport = httpx.MockTransport(lambda r: httpx.Response(500, text="boom"))
    client = httpx.Client(transport=transport, base_url="http://test")
    body = XiaozhiHttpBody(client=client)
    r = body.execute(BodyCommand(action="set_face", payload={"face": "sad"}))
    assert r.ok is False
    assert "500" in r.reason
