from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from desktop_robot.hardware.types import HardwareAssembly


class CustomSkill(BaseModel):
    name: str = Field(min_length=1, max_length=32)
    summary: str = Field(min_length=1, max_length=120)
    trigger: str = Field(default="", max_length=80)
    effect: str = Field(default="", max_length=120)


class Passport(BaseModel):
    robot_id: str
    name: str = Field(min_length=1, max_length=16)
    user_id: str = "local"
    body: Literal["fake", "xiaozhi", "linux", "esp32"] = "fake"
    body_id: str | None = None
    passport_rev: int = 1
    route: Literal["default", "custom"]
    status: Literal["draft", "ready"]
    installed_skill_ids: list[str]
    custom_skill: CustomSkill | None = None
    persona_id: str | None = None
    facts_seed: dict[str, str] = Field(default_factory=dict)
    appearance_kind: Literal["geometric", "glb"] = "geometric"
    hardware: HardwareAssembly | None = None
    hardware_capabilities: list[str] = Field(default_factory=list)
