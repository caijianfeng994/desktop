from __future__ import annotations

from dataclasses import dataclass

from desktop_robot.body.base import BodyClient
from desktop_robot.body.types import BodyCommand
from desktop_robot.brain.planner import RulePlanner
from desktop_robot.learn.engine import LearnEngine, path_key
from desktop_robot.memory.store import MemoryStore
from desktop_robot.skills.builtin import BUILTIN, SkillContext


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
    ) -> None:
        self.store = store
        self.body = body
        self.learn = learn
        self.planner = planner or RulePlanner()

    def run_turn(self, user_text: str, session_id: str) -> TurnResult:
        facts = self.store.list_facts()
        plan = self.planner.plan(user_text, facts)
        steps = self.learn.choose_path(plan.intent, plan.candidates)
        ctx = SkillContext(store=self.store, body=self.body)
        reply = plan.reply
        reason = ""
        ok = True

        for step in steps:
            if step in ("speak", "set_face", "look", "move"):
                payload: dict = {}
                if step == "speak":
                    payload = {"text": reply or "嗯"}
                elif step == "set_face":
                    payload = {"face": "happy"}
                elif step == "look":
                    payload = {"yaw": 20, "pitch": 0}
                result = self.body.execute(BodyCommand(action=step, payload=payload))
                if not result.ok:
                    ok = False
                    reason = result.reason or "body_fail"
                    break
            elif step in BUILTIN:
                out = BUILTIN[step](ctx, plan.skill_payload)
                if step == "get_time":
                    reply = f"现在是 {out}"
                elif step == "set_preference" and out:
                    reply = plan.reply or f"好的，记住了 {out}"
            else:
                ok = False
                reason = f"unknown_step:{step}"
                break

        self.learn.record(plan.intent, steps, ok=ok, reason=reason, session_id=session_id)
        return TurnResult(
            intent=plan.intent,
            steps=steps,
            ok=ok,
            reason=reason,
            reply=reply,
        )
