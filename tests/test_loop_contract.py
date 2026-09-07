from pathlib import Path

from desktop_robot.body.fake import FakeBody
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.memory.store import MemoryStore


def test_turn_updates_name_memory(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody()
    loop = ConversationLoop(
        store=store, body=body, learn=LearnEngine(store, explore_prob=0.0)
    )
    loop.run_turn("以后叫我阿明", session_id="s1")
    assert store.get_fact("user.call_me") == "阿明"
    assert any(c.action == "speak" for c in body.history)


def test_failed_look_recorded(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody(fail_actions={"look"})
    loop = ConversationLoop(
        store=store, body=body, learn=LearnEngine(store, explore_prob=0.0)
    )
    loop.run_turn("看看我", session_id="s2")
    assert store.get_weight("look_at_user", "look+set_face+speak") <= 0
