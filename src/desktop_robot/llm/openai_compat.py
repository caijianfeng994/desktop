from __future__ import annotations

import os

import httpx


class OpenAICompatLLM:
    """Cloud OpenAI-compatible chat completion. No-op if LLM_API_KEY missing."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("LLM_API_KEY", "")
        self.base_url = (base_url or os.getenv("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip(
            "/"
        )
        self.model = model or os.getenv("LLM_MODEL") or "gpt-4o-mini"

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def complete(self, prompt: str) -> str:
        if not self.available:
            raise RuntimeError("LLM_API_KEY not set")
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
