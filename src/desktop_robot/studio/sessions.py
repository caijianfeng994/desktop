from __future__ import annotations

import random
import threading
import time
import uuid
from dataclasses import dataclass, field

from desktop_robot.body.types import BodyCommand, BodyResult
from desktop_robot.brain.llm_reply import (
    FALLBACK_MONOLOGUES,
    build_idle_monologue_prompt,
)
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.llm.openai_compat import OpenAICompatLLM
from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.store import db_path, load_passport, passport_path
from desktop_robot.passport.types import Passport
from desktop_robot.skills.catalog import grants_for

# grant → (perform clip, face)
_PERFORM_BY_GRANT = {
    "wave": ("wave", "happy"),
    "nod": ("nod", "happy"),
    "hop": ("hop", "surprised"),
    "look": ("look", "wink"),
    "set_face": ("face", "wink"),
}

MONOLOGUE_COOLDOWN_S = 50.0


class StudioBody:
    """网页假 Body：记录表情与最近一句台词，供前端形象页驱动。"""

    def __init__(self) -> None:
        self.history: list[BodyCommand] = []
        self.last_face: str = "idle"
        self.last_speak: str = ""
        self.last_perform: str = "idle"

    def execute(self, cmd: BodyCommand) -> BodyResult:
        self.history.append(cmd)
        if cmd.action == "set_face":
            self.last_face = str(cmd.payload.get("face") or "happy")
        elif cmd.action == "speak":
            self.last_speak = str(cmd.payload.get("text") or "")
        elif cmd.action in ("look", "wave", "nod", "hop"):
            self.last_perform = cmd.action
            if cmd.action == "look":
                self.last_face = "wink"
        elif cmd.action == "tts":
            self.last_speak = str(cmd.payload.get("text") or self.last_speak)
            self.last_perform = "tts"
        elif cmd.action == "listen":
            self.last_perform = "listen"
        return BodyResult(ok=True)


@dataclass
class RobotSession:
    passport: Passport
    loop: ConversationLoop
    body: StudioBody
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    last_monologue_at: float = 0.0


class SessionRegistry:
    def __init__(self, data_root) -> None:
        self.data_root = data_root
        self._lock = threading.Lock()
        self._sessions: dict[str, RobotSession] = {}
        self._llm = OpenAICompatLLM()

    def get_passport(self, robot_id: str) -> Passport:
        path = passport_path(self.data_root, robot_id)
        if not path.is_file():
            raise FileNotFoundError(robot_id)
        return load_passport(path)

    def get_or_create(self, robot_id: str) -> RobotSession:
        with self._lock:
            if robot_id in self._sessions:
                return self._sessions[robot_id]
            passport = self.get_passport(robot_id)
            body = StudioBody()
            store = MemoryStore(str(db_path(self.data_root, robot_id)))
            loop = ConversationLoop(
                store=store,
                body=body,
                learn=LearnEngine(store, explore_prob=0.05),
                passport=passport,
                llm=self._llm,
                use_llm=True,
            )
            sess = RobotSession(passport=passport, loop=loop, body=body)
            self._sessions[robot_id] = sess
            return sess

    def chat(self, robot_id: str, text: str) -> dict:
        passport = self.get_passport(robot_id)
        if passport.status == "draft":
            return {
                "ok": False,
                "reason": "至少安装「基础对话」才能开始聊天。",
            }
        sess = self.get_or_create(robot_id)
        result = sess.loop.run_turn(text.strip(), session_id=sess.session_id)
        perform = next(
            (s for s in result.steps if s in ("wave", "nod", "hop", "look")),
            "face" if "set_face" in result.steps else "idle",
        )
        caps = {
            "listen": "listen" in (sess.loop.allowed or ()),
            "tts": "tts" in (sess.loop.allowed or ()),
            "see": "see" in (sess.loop.allowed or ()),
        }
        # 无护照限制时（理论不会进 studio）默认关
        if sess.loop.allowed is None:
            caps = {"listen": False, "tts": False, "see": False}
        return {
            "ok": True,
            "reply": result.reply,
            "face": sess.body.last_face,
            "perform": perform,
            "intent": result.intent,
            "steps": result.steps,
            "phase": "speaking",
            "use_tts": bool(caps["tts"] or "tts" in result.steps),
            "capabilities": caps,
        }

    def idle(self, robot_id: str, *, want_line: bool = False) -> dict:
        """空闲：按已装技能随机表演；可选限频自言自语。"""
        passport = self.get_passport(robot_id)
        if passport.status != "ready":
            return {"ok": False, "reason": "草稿不能空闲发挥"}

        sess = self.get_or_create(robot_id)
        allowed = grants_for(passport.installed_skill_ids)
        choices = [
            pair for grant, pair in _PERFORM_BY_GRANT.items() if grant in allowed
        ]
        if not choices:
            choices = [("idle", "idle")]

        perform, face = random.choice(choices)
        if perform in ("wave", "nod", "hop", "look"):
            sess.body.execute(BodyCommand(action=perform, payload={"clip": perform}))
        elif perform == "face":
            sess.body.execute(BodyCommand(action="set_face", payload={"face": face}))

        line: str | None = None
        if want_line and "speak" in allowed:
            now = time.monotonic()
            if now - sess.last_monologue_at >= MONOLOGUE_COOLDOWN_S:
                line = self._monologue(sess)
                sess.last_monologue_at = now
                if line:
                    sess.body.execute(
                        BodyCommand(action="speak", payload={"text": line})
                    )

        return {
            "ok": True,
            "perform": perform,
            "face": face,
            "line": line,
        }

    def _monologue(self, sess: RobotSession) -> str:
        facts = sess.loop.store.list_facts()
        prompt = build_idle_monologue_prompt(
            robot_name=sess.passport.name,
            facts=facts,
            persona_id=sess.passport.persona_id,
        )
        text: str | None = None
        if self._llm.available:
            try:
                text = self._llm.chat(
                    [
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": "自言自语一句"},
                    ]
                )
            except Exception:
                text = None
        if not text or not str(text).strip():
            text = random.choice(FALLBACK_MONOLOGUES)
        return str(text).strip()[:40]
