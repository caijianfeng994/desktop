from __future__ import annotations

from typing import Any, Protocol


class BridgeBackend(Protocol):
    def speak(self, text: str) -> None: ...

    def set_face(self, face: str) -> None: ...

    def look(self, yaw: float, pitch: float) -> None: ...


def dispatch(path: str, payload: dict[str, Any], backend: BridgeBackend) -> tuple[int, dict[str, Any]]:
    if path == "/v1/speak":
        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            return 400, {"ok": False, "reason": "missing_text"}
        backend.speak(text)
        return 200, {"ok": True}
    if path == "/v1/face":
        face = payload.get("face")
        if not isinstance(face, str) or not face.strip():
            return 400, {"ok": False, "reason": "missing_face"}
        backend.set_face(face)
        return 200, {"ok": True}
    if path == "/v1/look":
        try:
            yaw = float(payload.get("yaw", 0))
            pitch = float(payload.get("pitch", 0))
        except (TypeError, ValueError):
            return 400, {"ok": False, "reason": "invalid_look"}
        backend.look(yaw, pitch)
        return 200, {"ok": True}
    return 404, {"ok": False, "reason": f"not_found:{path}"}
