from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

BodyAction = Literal[
    "speak",
    "set_face",
    "look",
    "move",
    "wave",
    "nod",
    "hop",
    "listen",
    "tts",
]


class BodyCommand(BaseModel):
    action: BodyAction
    payload: dict[str, Any] = Field(default_factory=dict)
    timeout_s: float = 5.0


class BodyResult(BaseModel):
    ok: bool
    reason: str = ""
    data: dict[str, Any] | None = None
