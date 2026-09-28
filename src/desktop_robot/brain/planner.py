from __future__ import annotations

import re
from dataclasses import dataclass, field

from desktop_robot.passport.types import CustomSkill


@dataclass
class Plan:
    intent: str
    candidates: list[list[str]]
    reply: str
    skill_payload: dict = field(default_factory=dict)


class RulePlanner:
    def __init__(
        self,
        persona_id: str | None = None,
        custom_skill: CustomSkill | None = None,
        robot_name: str | None = None,
    ) -> None:
        self.persona_id = persona_id
        self.custom_skill = custom_skill
        self.robot_name = robot_name

    def _persona_wrap(self, base: str) -> str:
        pid = self.persona_id or ""
        if pid == "persona.cheer":
            text = f"{base} 加油！"
        elif pid == "persona.roast":
            text = f"{base}——不过你这问法也太直白了。"
        elif pid == "persona.think":
            text = f"……{base}"
        elif pid == "persona.argue":
            text = f"{base} 可你为什么要这么问呢？"
        else:
            text = base
        if self.custom_skill is not None:
            c = self.custom_skill
            hint = c.effect or c.summary
            if hint:
                text = f"{text}（{c.name}：{hint}）"
        return text

    def plan(self, user_text: str, facts: dict[str, str]) -> Plan:
        text = user_text.strip()
        owner = facts.get("user.call_me")
        robot = self.robot_name or "机器人"

        m = re.search(r"(?:以后)?叫我(.+)$", text)
        if m or ("叫我" in text and not any(k in text for k in ("你叫", "叫什么", "叫啥"))):
            value = m.group(1).strip() if m else text.split("叫我", 1)[-1].strip()
            value = value.strip("。.!！ ")
            if value:
                return Plan(
                    intent="set_name",
                    candidates=[["set_preference", "speak"]],
                    reply=f"好的，以后叫你{value}",
                    skill_payload={
                        "key": "user.call_me",
                        "value": value,
                        "source": "user_correct",
                    },
                )

        if any(k in text for k in ("挥手", "招手", "挥一挥", "挥挥手")):
            return Plan(
                intent="wave",
                candidates=[["wave", "set_face", "speak"], ["speak"]],
                reply=self._persona_wrap("嘿，跟你挥手！"),
            )

        if any(k in text for k in ("点头", "点点头", "点个头")):
            return Plan(
                intent="nod",
                candidates=[["nod", "set_face", "speak"], ["speak"]],
                reply=self._persona_wrap("好，我点头。"),
            )

        if any(k in text for k in ("跳一下", "跳一跳", "蹦一下", "蹦蹦", "跳一个")):
            return Plan(
                intent="hop",
                candidates=[["hop", "set_face", "speak"], ["speak"]],
                reply=self._persona_wrap("蹦！"),
            )

        if any(k in text for k in ("看看我", "看我", "转过来")):
            return Plan(
                intent="look_at_user",
                candidates=[["look", "set_face", "speak"], ["speak"]],
                reply=self._persona_wrap("我在看你啦"),
            )

        if any(
            k in text
            for k in (
                "看看前面",
                "看前面",
                "你看到什么",
                "看到了什么",
                "描述一下眼前",
                "观察一下",
            )
        ):
            return Plan(
                intent="see_scene",
                candidates=[["see", "set_face", "speak"], ["speak"]],
                reply="",
            )

        if any(k in text for k in ("读出来", "念出来", "大声说", "用声音说", "朗读")):
            return Plan(
                intent="tts_request",
                candidates=[["tts", "speak"], ["speak"]],
                reply=self._persona_wrap("好，我念给你听。"),
            )

        if any(k in text for k in ("几点", "几分")) or (
            "时间" in text and any(k in text for k in ("现在", "什么", "多少", "几"))
        ):
            return Plan(
                intent="ask_time",
                candidates=[["get_time", "speak"]],
                reply="",
            )

        if any(
            k in text
            for k in ("你叫什么", "你叫啥", "你是谁", "你的名字", "叫什么名字")
        ):
            reply = self._persona_wrap(f"我叫{robot}")
            if owner:
                reply = self._persona_wrap(f"我叫{robot}，你是{owner}对吧")
            return Plan(
                intent="ask_robot_name",
                candidates=[["set_face", "speak"], ["speak"]],
                reply=reply,
            )

        if any(k in text for k in ("你好", "您好", "嗨", "hello", "Hello", "在吗", "早上好", "晚上好")):
            if owner:
                reply = self._persona_wrap(f"你好，{owner}！我是{robot}")
            else:
                reply = self._persona_wrap(f"你好呀！我是{robot}")
            return Plan(
                intent="greeting",
                candidates=[["set_face", "speak"], ["speak"]],
                reply=reply,
            )

        if any(k in text for k in ("谢谢", "感谢")):
            return Plan(
                intent="thanks",
                candidates=[["set_face", "speak"], ["speak"]],
                reply=self._persona_wrap("不客气，有事再叫我"),
            )

        # 交互式兜底：确认听到了，并引导下一句，而不是只回显
        if owner:
            base = f"{owner}，我听到了。你是想让我做什么，还是随便聊聊？"
        else:
            base = "我听到了。你是想让我做什么，还是随便聊聊？"
        return Plan(
            intent="fallback",
            candidates=[["speak"]],
            reply=self._persona_wrap(base),
        )
