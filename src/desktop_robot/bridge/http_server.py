from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from desktop_robot.bridge.dispatch import BridgeBackend, dispatch


class _Handler(BaseHTTPRequestHandler):
    backend: BridgeBackend

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[bridge] {self.address_string()} {format % args}")

    def _write_json(self, status: int, body: dict[str, Any]) -> None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(payload, dict):
                raise ValueError("not object")
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
            self._write_json(400, {"ok": False, "reason": "invalid_json"})
            return
        status, body = dispatch(self.path.split("?", 1)[0], payload, self.backend)
        self._write_json(status, body)

    def do_GET(self) -> None:
        self._write_json(405, {"ok": False, "reason": "method_not_allowed"})


def make_server(host: str, port: int, backend: BridgeBackend) -> ThreadingHTTPServer:
    handler = type("BridgeHandler", (_Handler,), {"backend": backend})
    return ThreadingHTTPServer((host, port), handler)
