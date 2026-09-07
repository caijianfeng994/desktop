from __future__ import annotations

import httpx

from desktop_robot.body.types import BodyCommand, BodyResult


class XiaozhiHttpBody:
    def __init__(
        self,
        client: httpx.Client,
        routes: dict[str, str] | None = None,
        token: str | None = None,
    ) -> None:
        self.client = client
        self.token = token
        self.routes = routes or {
            "speak": "/v1/speak",
            "set_face": "/v1/face",
            "look": "/v1/look",
        }

    def execute(self, cmd: BodyCommand) -> BodyResult:
        if cmd.action == "move":
            return BodyResult(ok=False, reason="not_implemented")
        path = self.routes.get(cmd.action)
        if not path:
            return BodyResult(ok=False, reason=f"no_route:{cmd.action}")
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        try:
            r = self.client.post(path, json=cmd.payload, headers=headers, timeout=cmd.timeout_s)
        except httpx.TimeoutException:
            return BodyResult(ok=False, reason="timeout")
        except httpx.HTTPError as e:
            return BodyResult(ok=False, reason=str(e))
        if r.status_code >= 200 and r.status_code < 300:
            return BodyResult(ok=True)
        return BodyResult(ok=False, reason=str(r.status_code))
