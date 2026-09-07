from desktop_robot.brain.planner import RulePlanner


def test_greeting_plan():
    p = RulePlanner().plan("你好啊", {})
    assert p.intent == "greeting"
    assert ["speak"] in p.candidates or any("speak" in c for c in p.candidates)


def test_set_name_plan():
    p = RulePlanner().plan("以后叫我阿明", {})
    assert p.intent == "set_name"
