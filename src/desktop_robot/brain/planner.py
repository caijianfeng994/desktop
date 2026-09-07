from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Plan:
    intent: str
    candidates: list[list[str]]
    reply: str
    skill_payload: dict = field(default_factory=dict)


class RulePlanner:
    def plan(self, user_text: str, facts: dict[str, str]) -> Plan:
        text = user_text.strip()
        name = facts.get("user.call_me")

        m = re.search(r"(?:以后)?叫我(.+)$", text)
        if m or "叫我" in text:
            value = m.group(1).strip() if m else text.split("叫我", 1)[-1].strip()
            value = value.strip("。.!！ ")
            return Plan(
                intent="set_name",
                candidates=[["set_preference", "speak"]],
                reply=f"好的，以后叫你{value}",
                skill_payload={"key": "user.call_me", "value": value, "source": "user_correct"},
            )

        if any(k in text for k in ("看看我", "看我")):
            return Plan(
                intent="look_at_user",
                candidates=[["look", "set_face", "speak"], ["speak"]],
                reply="我在看你啦",
            )

        if any(k in text for k in ("几点", "时间", "几分")):
            return Plan(
                intent="ask_time",
                candidates=[["get_time", "speak"]],
                reply="",  # filled after get_time
            )

        if any(k in text for k in ("你好", "嗨", "hello", "Hello")):
            reply = f"你好，{name}" if name else "你好呀"
            return Plan(
                intent="greeting",
                candidates=[["set_face", "speak"], ["speak"]],
                reply=reply,
            )

        reply = f"{name}，我听到了：{text}" if name else f"我听到了：{text}"
        return Plan(
            intent="fallback",
            candidates=[["speak"]],
            reply=reply,
        )
