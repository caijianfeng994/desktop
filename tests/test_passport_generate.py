from pathlib import Path

import pytest

from desktop_robot.body.fake import FakeBody
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.generate import GenerateError, _validate_skills, generate_robot
from desktop_robot.passport.store import load_passport, passport_path
from desktop_robot.passport.types import CustomSkill, Passport
from desktop_robot.skills.catalog import DEFAULT_PACK, list_catalog


def test_catalog_cards_have_effects():
    cards = list_catalog()
    assert len(cards) >= 10
    for c in cards:
        assert c.summary
        assert c.effect_web
        assert c.effect_device


def test_default_pack_ready(tmp_path: Path):
    p = generate_robot(data_root=tmp_path, name="小葱", route="default")
    assert p.status == "ready"
    assert p.appearance_kind == "geometric"
    assert list(p.installed_skill_ids) == list(DEFAULT_PACK)
    assert (tmp_path / "robots" / p.robot_id / "robot.db").exists()
    loaded = load_passport(passport_path(tmp_path, p.robot_id))
    assert loaded.facts_seed.get("user.call_me") == "小葱"
    assert loaded.appearance_kind == "geometric"


def test_custom_draft_without_chat(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="空壳",
        route="custom",
        skill_ids=["face.perform"],
    )
    assert p.status == "draft"
    assert "chat.base" not in p.installed_skill_ids


def test_persona_mutex(tmp_path: Path):
    with pytest.raises(GenerateError, match="人设"):
        generate_robot(
            data_root=tmp_path,
            name="冲突",
            route="custom",
            skill_ids=["chat.base", "persona.cheer", "persona.roast"],
        )


def test_max_skills(tmp_path: Path):
    ids = [
        "chat.base",
        "memory.base",
        "memory.owner",
        "face.perform",
        "look.at_user",
        "clock.tell",
        "persona.cheer",
        "body.wave",
        "body.nod",
        "body.hop",
        "sense.listen",
        "voice.tts",
        "sense.see",
    ]
    generate_robot(
        data_root=tmp_path,
        name="满配",
        route="custom",
        skill_ids=ids,
        custom_skill=CustomSkill(name="独门", summary="专属口头禅"),
    )
    with pytest.raises(GenerateError, match="超过"):
        _validate_skills(ids + ["online.hf.kokoro_tts"], allow_custom_slot=True)


def test_online_skill_installable(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="线上",
        route="custom",
        skill_ids=["chat.base", "online.hf.kokoro_tts", "online.hf.whisper_stt"],
    )
    assert "online.hf.kokoro_tts" in p.installed_skill_ids
    from desktop_robot.skills.catalog import grants_for

    g = grants_for(p.installed_skill_ids)
    assert "tts" in g and "listen" in g


def test_catalog_has_online_and_default_flags():
    from desktop_robot.skills.catalog import CATALOG, list_online, list_official

    assert any(c.in_default_pack for c in list_official())
    assert len(list_online()) >= 5
    assert CATALOG["online.hf.kokoro_tts"].origin == "huggingface"
    assert CATALOG["online.github.reachy_mini"].origin == "github"


def _loop(tmp_path: Path, passport: Passport) -> tuple[ConversationLoop, FakeBody, MemoryStore]:
    db = tmp_path / "r.db"
    store = MemoryStore(str(db))
    for k, v in passport.facts_seed.items():
        store.set_fact(k, v, source="seed")
    body = FakeBody()
    loop = ConversationLoop(
        store=store,
        body=body,
        learn=LearnEngine(store, explore_prob=0.0),
        passport=passport,
    )
    return loop, body, store


def test_default_greeting_uses_face(tmp_path: Path):
    p = generate_robot(data_root=tmp_path, name="小葱", route="default")
    loop, body, _ = _loop(tmp_path, p)
    r = loop.run_turn("你好", session_id="s")
    assert "set_face" in r.steps
    assert "speak" in r.steps
    assert any(c.action == "set_face" for c in body.history)


def test_chat_only_no_look_no_clock(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="简配",
        route="custom",
        skill_ids=["chat.base"],
    )
    loop, body, store = _loop(tmp_path, p)
    r1 = loop.run_turn("看看我", session_id="s")
    assert "look" not in r1.steps
    assert not any(c.action == "look" for c in body.history)
    r2 = loop.run_turn("现在几点", session_id="s")
    assert "get_time" not in r2.steps
    assert "不会报时" in r2.reply


def test_wave_requires_skill(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="不会挥",
        route="custom",
        skill_ids=["chat.base"],
    )
    loop, body, _ = _loop(tmp_path, p)
    r = loop.run_turn("挥手", session_id="s")
    assert "wave" not in r.steps
    assert "挥手打招呼" in r.reply
    assert not any(c.action == "wave" for c in body.history)


def test_perform_skills_when_installed(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="能演",
        route="custom",
        skill_ids=["chat.base", "face.perform", "body.wave", "body.nod", "body.hop"],
    )
    loop, body, _ = _loop(tmp_path, p)
    r1 = loop.run_turn("挥手", session_id="s")
    assert "wave" in r1.steps
    assert any(c.action == "wave" for c in body.history)
    r2 = loop.run_turn("点头", session_id="s")
    assert "nod" in r2.steps
    r3 = loop.run_turn("跳一下", session_id="s")
    assert "hop" in r3.steps
    faces = [c.payload.get("face") for c in body.history if c.action == "set_face"]
    assert "surprised" in faces


def test_see_and_tts_skills(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="感官",
        route="custom",
        skill_ids=["chat.base", "sense.see", "voice.tts", "face.perform"],
    )
    loop, body, _ = _loop(tmp_path, p)
    r = loop.run_turn("你看到什么", session_id="s")
    assert "see" in r.steps
    assert "桌面" in r.reply
    r2 = loop.run_turn("读出来", session_id="s")
    assert "tts" in r2.steps


def test_see_requires_skill(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="瞎",
        route="custom",
        skill_ids=["chat.base"],
    )
    loop, _, _ = _loop(tmp_path, p)
    r = loop.run_turn("看看前面", session_id="s")
    assert "see" not in r.steps
    assert "看一看" in r.reply


def test_no_memory_base_skips_fact_write(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="健忘",
        route="custom",
        skill_ids=["chat.base"],
    )
    loop, _, store = _loop(tmp_path, p)
    loop.run_turn("以后叫我阿明", session_id="s")
    assert store.get_fact("user.call_me") is None


def test_look_and_clock_when_installed(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="全能",
        route="custom",
        skill_ids=["chat.base", "look.at_user", "face.perform", "clock.tell"],
    )
    loop, body, _ = _loop(tmp_path, p)
    r1 = loop.run_turn("看看我", session_id="s")
    assert "look" in r1.steps
    r2 = loop.run_turn("现在几点", session_id="s")
    assert "get_time" in r2.steps
    assert "现在是" in r2.reply
