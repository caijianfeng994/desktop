from __future__ import annotations

import json
import random

from desktop_robot.memory.store import MemoryStore


def path_key(steps: list[str]) -> str:
    return "+".join(steps)


class LearnEngine:
    def __init__(self, store: MemoryStore, explore_prob: float = 0.1) -> None:
        self.store = store
        self.explore_prob = explore_prob

    def record(
        self,
        intent: str,
        steps: list[str],
        ok: bool,
        reason: str,
        session_id: str,
    ) -> None:
        key = path_key(steps)
        w = self.store.get_weight(intent, key)
        self.store.set_weight(intent, key, w + (1 if ok else -1))
        self.store.add_trace(
            intent,
            json.dumps(steps, ensure_ascii=False),
            ok,
            reason,
            session_id,
        )

    def choose_path(
        self,
        intent: str,
        candidates: list[list[str]],
        rng: random.Random | None = None,
    ) -> list[str]:
        rng = rng or random.Random()
        if not candidates:
            raise ValueError("candidates empty")
        scored = sorted(
            (
                (self.store.get_weight(intent, path_key(c)), i, c)
                for i, c in enumerate(candidates)
            ),
            key=lambda t: (-t[0], t[1]),
        )
        best = scored[0][2]
        if len(candidates) > 1 and rng.random() < self.explore_prob:
            others = [c for c in candidates if c != best]
            return rng.choice(others)
        return best
