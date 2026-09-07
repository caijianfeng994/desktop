from desktop_robot.memory.store import MemoryStore


def test_set_get_overwrite_fact(tmp_path):
    store = MemoryStore(str(tmp_path / "m.db"))
    store.set_fact("user.call_me", "小明", source="user_confirm")
    store.set_fact("user.call_me", "阿明", source="user_correct")
    assert store.get_fact("user.call_me") == "阿明"


def test_delete_and_clear(tmp_path):
    store = MemoryStore(str(tmp_path / "m.db"))
    store.set_fact("prefer.reply_short", "true", source="user_say")
    assert store.delete_fact("prefer.reply_short") is True
    store.set_fact("a", "1", source="user_say")
    store.clear_all()
    assert store.get_fact("a") is None


def test_weight_and_trace(tmp_path):
    store = MemoryStore(str(tmp_path / "m.db"))
    assert store.get_weight("greeting", "face+speak") == 0
    store.set_weight("greeting", "face+speak", 2)
    assert store.get_weight("greeting", "face+speak") == 2
    tid = store.add_trace("greeting", '["set_face","speak"]', True, "", "s1")
    assert tid >= 1
