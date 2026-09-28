from desktop_robot.brain.planner import RulePlanner


def test_greeting_plan():
    p = RulePlanner().plan("你好啊", {})
    assert p.intent == "greeting"
    assert ["speak"] in p.candidates or any("speak" in c for c in p.candidates)


def test_greeting_nin_hao():
    p = RulePlanner(robot_name="小葱").plan("您好", {})
    assert p.intent == "greeting"
    assert "小葱" in p.reply


def test_ask_robot_name():
    p = RulePlanner(robot_name="小葱").plan("你叫什么", {"user.call_me": "阿明"})
    assert p.intent == "ask_robot_name"
    assert "小葱" in p.reply


def test_set_name_plan():
    p = RulePlanner().plan("以后叫我阿明", {})
    assert p.intent == "set_name"


def test_planner_see_and_tts():
    assert RulePlanner().plan("你看到什么", {}).intent == "see_scene"
    assert RulePlanner().plan("读出来", {}).intent == "tts_request"
