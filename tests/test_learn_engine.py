import random
from pathlib import Path

from desktop_robot.learn.engine import LearnEngine, path_key
from desktop_robot.memory.store import MemoryStore


def test_record_success_increments(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    eng = LearnEngine(store, explore_prob=0.0)
    steps = ["set_face", "speak"]
    eng.record("greeting", steps, ok=True, reason="", session_id="s1")
    assert store.get_weight("greeting", path_key(steps)) == 1
    eng.record("greeting", steps, ok=False, reason="tts_timeout", session_id="s2")
    assert store.get_weight("greeting", path_key(steps)) == 0


def test_choose_prefers_higher_weight(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    eng = LearnEngine(store, explore_prob=0.0)
    a, b = ["speak"], ["set_face", "speak"]
    store.set_weight("greeting", path_key(a), 1)
    store.set_weight("greeting", path_key(b), 5)
    chosen = eng.choose_path("greeting", [a, b], rng=random.Random(0))
    assert chosen == b
