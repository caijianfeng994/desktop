from desktop_robot.body.fake import FakeBody
from desktop_robot.body.types import BodyCommand


def test_fake_body_records_and_ok():
    body = FakeBody()
    r = body.execute(BodyCommand(action="set_face", payload={"face": "happy"}))
    assert r.ok is True
    assert body.history[-1].action == "set_face"


def test_fake_body_can_force_fail():
    body = FakeBody(fail_actions={"look"})
    r = body.execute(BodyCommand(action="look", payload={"yaw": 20}))
    assert r.ok is False
    assert r.reason == "forced_fail"
