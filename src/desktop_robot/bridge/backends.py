from __future__ import annotations

import subprocess
from typing import Any


class LogBackend:
    def __init__(self, tts_cmd: list[str] | None = None) -> None:
        self.history: list[tuple[str, dict[str, Any]]] = []
        self.tts_cmd = tts_cmd

    def speak(self, text: str) -> None:
        self.history.append(("speak", {"text": text}))
        if self.tts_cmd:
            try:
                subprocess.run([*self.tts_cmd, text], check=False, timeout=8)
            except (OSError, subprocess.TimeoutExpired):
                pass

    def set_face(self, face: str) -> None:
        self.history.append(("set_face", {"face": face}))

    def look(self, yaw: float, pitch: float) -> None:
        self.history.append(("look", {"yaw": yaw, "pitch": pitch}))
