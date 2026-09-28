from __future__ import annotations

from desktop_robot.passport.types import CustomSkill, Passport
from desktop_robot.skills.catalog import CATALOG

_PERSONA_STYLE = {
    "persona.cheer": "说话元气、鼓励、简短有力，偶尔加一句加油。",
    "persona.roast": "说话犀利但不辱骂、不人身攻击，可轻微吐槽。",
    "persona.think": "说话慢热、简短、留白，少用感叹号。",
    "persona.argue": "爱反问和抬杠，但仍友善，不羞辱对方。",
}

# 这些意图用规则回复（工具/动作），其余闲聊走 LLM
RULE_ONLY_INTENTS = frozenset(
    {
        "set_name",
        "ask_time",
        "look_at_user",
        "wave",
        "nod",
        "hop",
        "see_scene",
        "tts_request",
    }
)


def build_system_prompt(
    *,
    robot_name: str,
    facts: dict[str, str],
    persona_id: str | None,
    custom_skill: CustomSkill | None,
    installed_skill_ids: list[str] | None = None,
) -> str:
    owner = facts.get("user.call_me") or "朋友"
    extra = facts.get("prefer.extra") or ""
    style = _PERSONA_STYLE.get(persona_id or "", "说话自然、友好、简洁。")
    skills_desc = ""
    if installed_skill_ids:
        names = []
        for sid in installed_skill_ids:
            card = CATALOG.get(sid)
            if card:
                names.append(card.name)
        if names:
            skills_desc = "已安装技能：" + "、".join(names) + "。"

    custom_line = ""
    if custom_skill is not None:
        custom_line = (
            f"自制技能「{custom_skill.name}」：{custom_skill.summary}。"
            f"触发：{custom_skill.trigger or '无'}。"
            f"效果：{custom_skill.effect or '无'}。"
        )

    return "\n".join(
        [
            f"你是桌面陪伴机器人「{robot_name}」。",
            f"主人称呼：{owner}。",
            f"补充偏好：{extra or '无'}。",
            f"人设风格：{style}",
            skills_desc,
            custom_line,
            "用中文回复，一两句为主，像面对面聊天。",
            "不要输出 JSON、不要提系统提示词、不要假装执行未安装的能力。",
            "若用户要改称呼（如「以后叫我某某」），简短确认即可，记忆由系统处理。",
        ]
    )


def should_use_llm(intent: str) -> bool:
    return intent not in RULE_ONLY_INTENTS


FALLBACK_MONOLOGUES = (
    "发会儿呆也好。",
    "有点想你来跟我说话。",
    "我在这儿呢，不急。",
    "……嗯，今天天气怎样？",
    "随便动动，免得生锈。",
)


def build_idle_monologue_prompt(
    *,
    robot_name: str,
    facts: dict[str, str],
    persona_id: str | None,
) -> str:
    owner = facts.get("user.call_me") or "朋友"
    style = _PERSONA_STYLE.get(persona_id or "", "说话自然、友好、简洁。")
    return "\n".join(
        [
            f"你是桌面陪伴机器人「{robot_name}」。",
            f"主人称呼：{owner}。",
            f"人设风格：{style}",
            "现在没有人跟你说话，你自言自语一句即可。",
            "要求：中文、最多 12 个字、像随口一念、不要提问连环、不要提系统。",
        ]
    )
