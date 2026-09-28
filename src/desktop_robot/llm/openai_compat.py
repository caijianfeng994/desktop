from __future__ import annotations

import os
from pathlib import Path

import httpx


def load_dotenv(path: str | Path = ".env") -> None:
    """Load KEY=VALUE from .env into os.environ if not already set."""
    p = Path(path)
    if not p.is_file():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def _resolve_gateway() -> tuple[str, str, str]:
    """Prefer AI_GATEWAY_* (团队网关), fallback to LLM_*."""
    api_key = (
        os.getenv("AI_GATEWAY_API_KEY")
        or os.getenv("LLM_API_KEY")
        or ""
    ).strip()
    base_url = (
        os.getenv("AI_GATEWAY_BASE_URL")
        or os.getenv("LLM_BASE_URL")
        or "https://api.openai.com/v1"
    ).strip().rstrip("/")
    model = (
        os.getenv("AI_GATEWAY_MODEL")
        or os.getenv("LLM_MODEL")
        or "gpt-4o-mini"
    ).strip()
    return api_key, base_url, model


class OpenAICompatLLM:
    """OpenAI 兼容 Chat Completions（含 yc345 AI Gateway / DeepSeek）。"""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        temperature: float = 0.7,
        timeout: float = 60.0,
    ) -> None:
        g_key, g_base, g_model = _resolve_gateway()
        self.api_key = api_key if api_key is not None else g_key
        self.base_url = (base_url or g_base).rstrip("/")
        self.model = model or g_model
        self.temperature = temperature
        self.timeout = timeout

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def complete(self, prompt: str) -> str:
        return self.chat([{"role": "user", "content": prompt}])

    def chat(self, messages: list[dict[str, str]]) -> str:
        if not self.available:
            raise RuntimeError("未配置 AI_GATEWAY_API_KEY 或 LLM_API_KEY")
        with httpx.Client(timeout=self.timeout) as client:
            r = client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": self.temperature,
                },
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
            return (content or "").strip()
