from pathlib import Path

from desktop_robot.passport.generate import generate_robot
from desktop_robot.studio.sessions import MONOLOGUE_COOLDOWN_S, SessionRegistry


class FakeLLM:
    available = True

    def chat(self, messages):
        return "网页里你好呀"


class IdleLLM:
    available = True

    def chat(self, messages):
        return "发会儿呆也好"


def test_session_chat(tmp_path: Path):
    p = generate_robot(data_root=tmp_path, name="网页葱", route="default")
    reg = SessionRegistry(tmp_path)
    reg._llm = FakeLLM()  # type: ignore[assignment]
    out = reg.chat(p.robot_id, "您好")
    assert out["ok"] is True
    assert out["reply"] == "网页里你好呀"
    assert "face" in out


def test_draft_cannot_chat(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="草稿",
        route="custom",
        skill_ids=["face.perform"],
    )
    reg = SessionRegistry(tmp_path)
    out = reg.chat(p.robot_id, "你好")
    assert out["ok"] is False
    assert "基础对话" in out["reason"]


def test_idle_perform_default_pack(tmp_path: Path):
    p = generate_robot(data_root=tmp_path, name="闲葱", route="default")
    reg = SessionRegistry(tmp_path)
    reg._llm = IdleLLM()  # type: ignore[assignment]
    out = reg.idle(p.robot_id, want_line=False)
    assert out["ok"] is True
    assert out["perform"] in ("face", "idle", "wave", "nod")
    assert out["line"] is None


def test_idle_monologue_cooldown(tmp_path: Path):
    p = generate_robot(data_root=tmp_path, name="话痨", route="default")
    reg = SessionRegistry(tmp_path)
    reg._llm = IdleLLM()  # type: ignore[assignment]
    a = reg.idle(p.robot_id, want_line=True)
    assert a["ok"] is True
    assert a["line"] == "发会儿呆也好"
    b = reg.idle(p.robot_id, want_line=True)
    assert b["line"] is None
    sess = reg.get_or_create(p.robot_id)
    sess.last_monologue_at -= MONOLOGUE_COOLDOWN_S + 1
    c = reg.idle(p.robot_id, want_line=True)
    assert c["line"]


def test_idle_wave_when_installed(tmp_path: Path):
    p = generate_robot(
        data_root=tmp_path,
        name="能动",
        route="custom",
        skill_ids=["chat.base", "body.wave", "face.perform"],
    )
    reg = SessionRegistry(tmp_path)
    seen = set()
    for _ in range(30):
        out = reg.idle(p.robot_id, want_line=False)
        seen.add(out["perform"])
    assert "wave" in seen or "face" in seen
