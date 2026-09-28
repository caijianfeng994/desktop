from __future__ import annotations

from dataclasses import dataclass, field

from desktop_robot.body.base import BodyClient
from desktop_robot.body.types import BodyCommand
from desktop_robot.memory.store import MemoryStore


@dataclass
class SkillContext:
    store: MemoryStore
    body: BodyClient


def get_time(ctx: SkillContext, payload: dict) -> str:
    from datetime import datetime

    return datetime.now().strftime("%H:%M")


def set_preference(ctx: SkillContext, payload: dict) -> str:
    key = payload.get("key", "user.call_me")
    value = payload.get("value", "")
    source = payload.get("source", "user_correct")
    if not value:
        return ""
    ctx.store.set_fact(key, value, source=source)
    return value


def forget_preference(ctx: SkillContext, payload: dict) -> str:
    key = payload.get("key", "")
    if key:
        ctx.store.delete_fact(key)
    return key


def see_scene(ctx: SkillContext, payload: dict) -> str:
    """假视觉：无摄像头时返回固定陪伴向描述。"""
    return "我假装看了一眼前方：桌面还在，光线还行，主人好像也在附近。"


BUILTIN = {
    "get_time": get_time,
    "set_preference": set_preference,
    "forget_preference": forget_preference,
    "see": see_scene,
}
