from desktop_robot.body.types import BodyCommand, BodyResult


def test_speak_command_roundtrip_fields():
    cmd = BodyCommand(action="speak", payload={"text": "你好"}, timeout_s=3.0)
    assert cmd.action == "speak"
    assert cmd.payload["text"] == "你好"


def test_result_fail_has_reason():
    r = BodyResult(ok=False, reason="tts_timeout")
    assert r.ok is False
    assert r.reason == "tts_timeout"
