from __future__ import annotations

from dataclasses import dataclass

from desktop_robot.body.base import BodyClient
from desktop_robot.body.types import BodyCommand
from desktop_robot.brain.llm_reply import build_system_prompt, should_use_llm
from desktop_robot.brain.planner import RulePlanner
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.llm.openai_compat import OpenAICompatLLM
from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.types import CustomSkill, Passport
from desktop_robot.skills.builtin import BUILTIN, SkillContext
from desktop_robot.skills.catalog import grants_for


BODY_STEPS = frozenset(
    {"speak", "set_face", "look", "move", "wave", "nod", "hop", "listen", "tts"}
)

FACE_BY_INTENT = {
    "greeting": "happy",
    "thanks": "happy",
    "ask_robot_name": "happy",
    "look_at_user": "wink",
    "wave": "happy",
    "nod": "happy",
    "hop": "surprised",
    "ask_time": "idle",
    "set_name": "happy",
    "fallback": "idle",
    "see_scene": "surprised",
    "tts_request": "happy",
}

MISSING_PERFORM = {
    "wave": "我还不会挥手。去装配页装上「挥手打招呼」吧。",
    "nod": "我还不会点头。去装配页装上「点头」才行。",
    "hop": "我还不会跳。去装配页装上「小跳」才行。",
    "look_at_user": "我还不会转头看你。去装配页装上「看看我」才行。",
    "see_scene": "我还不会看环境。去装配页装上「看一看」才行。",
    "tts_request": "我还不会朗读。去装配页装上「说出来」才行。",
}


def filter_steps(steps: list[str], allowed: frozenset[str] | None) -> list[str]:
    """No passport (allowed is None) => unlock all. Otherwise keep granted steps."""
    if allowed is None:
        return list(steps)
    filtered = [s for s in steps if s in allowed]
    if not filtered or "speak" not in filtered:
        if "speak" in allowed:
            return ["speak"]
        return []
    return filtered


@dataclass
class TurnResult:
    intent: str
    steps: list[str]
    ok: bool
    reason: str
    reply: str


class ConversationLoop:
    def __init__(
        self,
        store: MemoryStore,
        body: BodyClient,
        learn: LearnEngine,
        planner: RulePlanner | None = None,
        passport: Passport | None = None,
        llm: OpenAICompatLLM | None = None,
        use_llm: bool = True,
    ) -> None:
        self.store = store
        self.body = body
        self.learn = learn
        self.passport = passport
        self.llm = llm
        self.use_llm = use_llm
        self._history: list[dict[str, str]] = []
        if passport is None:
            self.allowed: frozenset[str] | None = None
            persona_id = None
            custom: CustomSkill | None = None
            robot_name = None
            installed: list[str] | None = None
        else:
            self.allowed = grants_for(passport.installed_skill_ids)
            persona_id = passport.persona_id
            custom = passport.custom_skill
            robot_name = passport.name
            installed = list(passport.installed_skill_ids)
        self._persona_id = persona_id
        self._custom = custom
        self._robot_name = robot_name or "机器人"
        self._installed = installed
        self.planner = planner or RulePlanner(
            persona_id=persona_id,
            custom_skill=custom,
            robot_name=robot_name,
        )

    def _llm_reply(self, user_text: str, facts: dict[str, str]) -> str | None:
        if not self.use_llm or self.llm is None or not self.llm.available:
            return None
        system = build_system_prompt(
            robot_name=self._robot_name,
            facts=facts,
            persona_id=self._persona_id,
            custom_skill=self._custom,
            installed_skill_ids=self._installed,
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        messages.extend(self._history[-8:])
        messages.append({"role": "user", "content": user_text})
        try:
            return self.llm.chat(messages)
        except Exception:
            return None

    def run_turn(self, user_text: str, session_id: str) -> TurnResult:
        facts = self.store.list_facts()
        plan = self.planner.plan(user_text, facts)
        raw_steps = self.learn.choose_path(plan.intent, plan.candidates)
        steps = filter_steps(raw_steps, self.allowed)
        ctx = SkillContext(store=self.store, body=self.body)
        reply = plan.reply
        reason = ""
        ok = True

        if self.allowed is not None and not steps:
            return TurnResult(
                intent=plan.intent,
                steps=[],
                ok=False,
                reason="no_granted_steps",
                reply="我还没装能说话的技能",
            )

        if self.allowed is not None and "get_time" in raw_steps and "get_time" not in self.allowed:
            if plan.intent == "ask_time":
                reply = "我还不会报时"
                steps = filter_steps(["speak"], self.allowed)

        need = {
            "wave": "wave",
            "nod": "nod",
            "hop": "hop",
            "look_at_user": "look",
            "see_scene": "see",
            "tts_request": "tts",
        }
        grant = need.get(plan.intent)
        if self.allowed is not None and grant and grant not in self.allowed:
            msg = MISSING_PERFORM.get(plan.intent)
            if msg:
                reply = msg
                steps = filter_steps(["speak"], self.allowed)

        # 闲聊意图优先 LLM；工具意图保留规则回复
        if should_use_llm(plan.intent):
            llm_text = self._llm_reply(user_text, facts)
            if llm_text:
                reply = llm_text
                # 确保有 speak
                if "speak" not in steps and (self.allowed is None or "speak" in self.allowed):
                    steps = list(steps) + ["speak"]

        for step in steps:
            if step in BODY_STEPS:
                payload: dict = {}
                if step == "speak":
                    payload = {"text": reply or "嗯"}
                elif step == "set_face":
                    payload = {"face": FACE_BY_INTENT.get(plan.intent, "happy")}
                elif step == "look":
                    payload = {"yaw": 20, "pitch": 0}
                elif step in ("wave", "nod", "hop"):
                    payload = {"clip": step}
                elif step == "tts":
                    payload = {"text": reply or "嗯"}
                elif step == "listen":
                    payload = {"mode": "ready"}
                result = self.body.execute(BodyCommand(action=step, payload=payload))
                if not result.ok:
                    ok = False
                    reason = result.reason or "body_fail"
                    break
            elif step in BUILTIN:
                if self.allowed is not None and step not in self.allowed:
                    continue
                out = BUILTIN[step](ctx, plan.skill_payload)
                if step == "get_time":
                    reply = f"现在是 {out}"
                elif step == "set_preference" and out:
                    reply = plan.reply or f"好的，记住了 {out}"
                elif step == "see" and out:
                    reply = out
            else:
                ok = False
                reason = f"unknown_step:{step}"
                break

        if plan.intent == "see_scene" and reply and "speak" not in steps:
            if self.allowed is None or "speak" in self.allowed:
                steps = list(steps) + ["speak"]
                self.body.execute(BodyCommand(action="speak", payload={"text": reply}))

        self._history.append({"role": "user", "content": user_text})
        self._history.append({"role": "assistant", "content": reply or ""})
        if len(self._history) > 16:
            self._history = self._history[-16:]

        self.learn.record(plan.intent, steps, ok=ok, reason=reason, session_id=session_id)
        return TurnResult(
            intent=plan.intent,
            steps=steps,
            ok=ok,
            reason=reason,
            reply=reply,
        )
