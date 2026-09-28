from desktop_robot.brain.llm_reply import build_system_prompt, should_use_llm
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.body.fake import FakeBody
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.types import Passport


class FakeLLM:
    def __init__(self, text: str = "LLM说你好") -> None:
        self.text = text
        self.calls: list[list[dict[str, str]]] = []

    @property
    def available(self) -> bool:
        return True

    def chat(self, messages: list[dict[str, str]]) -> str:
        self.calls.append(messages)
        return self.text


def test_should_use_llm_skips_tools():
    assert should_use_llm("fallback")
    assert should_use_llm("greeting")
    assert not should_use_llm("set_name")
    assert not should_use_llm("ask_time")
    assert not should_use_llm("wave")
    assert not should_use_llm("nod")


def test_loop_uses_llm_for_chat(tmp_path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody()
    llm = FakeLLM("嗨，我是 LLM 小葱")
    passport = Passport(
        robot_id="r1",
        name="小葱",
        route="default",
        status="ready",
        installed_skill_ids=[
            "chat.base",
            "memory.base",
            "face.perform",
            "memory.owner",
            "persona.cheer",
        ],
        persona_id="persona.cheer",
        facts_seed={},
    )
    loop = ConversationLoop(
        store=store,
        body=body,
        learn=LearnEngine(store, explore_prob=0.0),
        passport=passport,
        llm=llm,  # type: ignore[arg-type]
        use_llm=True,
    )
    r = loop.run_turn("您好", session_id="s")
    assert r.reply == "嗨，我是 LLM 小葱"
    assert llm.calls
    assert llm.calls[0][0]["role"] == "system"


def test_loop_set_name_still_rules(tmp_path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody()
    llm = FakeLLM("不该用这条")
    loop = ConversationLoop(
        store=store,
        body=body,
        learn=LearnEngine(store, explore_prob=0.0),
        llm=llm,  # type: ignore[arg-type]
        use_llm=True,
    )
    r = loop.run_turn("以后叫我阿明", session_id="s")
    assert store.get_fact("user.call_me") == "阿明"
    assert "阿明" in r.reply
    assert r.reply != "不该用这条"


def test_system_prompt_includes_name():
    text = build_system_prompt(
        robot_name="小葱",
        facts={"user.call_me": "阿明"},
        persona_id="persona.cheer",
        custom_skill=None,
        installed_skill_ids=["chat.base"],
    )
    assert "小葱" in text
    assert "阿明" in text
