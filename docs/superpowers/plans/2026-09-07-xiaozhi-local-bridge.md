# 小智本地 REST 桥 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本机 `127.0.0.1:8787` 提供与 `XiaozhiHttpBody` 对齐的 REST 桥，使 `python -m desktop_robot --body xiaozhi` 能走真实 HTTP 闭环。

**Architecture:** 标准库 HTTP 服务只暴露 `POST /v1/speak|face|look`；执行交给可插拔 `BridgeBackend`。默认 `LogBackend`（记录命令，macOS 可选 `say` TTS）。实机 MCP/py-xiaozhi 不作为本任务依赖，仅预留 Protocol。

**Tech Stack:** Python 3.11+ 标准库 `http.server`、现有 `httpx`/`pytest`；不新增第三方依赖。

## Global Constraints

- 监听默认 `127.0.0.1:8787`，禁止默认绑 `0.0.0.0`
- 路由与 `XiaozhiHttpBody` 默认表一致：`speak`/`set_face`/`look`
- `move` 不在桥上实现
- API Key 不进 git；提交信息用简体中文 Conventional Commits
- 无 ESP32 时也必须能测通 HTTP 契约

---

## File Structure

```text
src/desktop_robot/bridge/
  __init__.py
  backends.py      # BridgeBackend / LogBackend
  dispatch.py      # path + JSON → status/body
  http_server.py   # ThreadingHTTPServer
  __main__.py      # python -m desktop_robot.bridge
tests/test_xiaozhi_bridge.py
scripts/smoke_xiaozhi.md   # 修改
README.md                  # 修改
```

---

### Task 1: 路由分发 + LogBackend 契约

**Files:**
- Create: `src/desktop_robot/bridge/__init__.py`
- Create: `src/desktop_robot/bridge/backends.py`
- Create: `src/desktop_robot/bridge/dispatch.py`
- Test: `tests/test_xiaozhi_bridge.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `LogBackend.history: list[tuple[str, dict]]`
  - `LogBackend.speak(text: str) -> None`
  - `LogBackend.set_face(face: str) -> None`
  - `LogBackend.look(yaw: float, pitch: float) -> None`
  - `dispatch(path: str, payload: dict, backend: LogBackend) -> tuple[int, dict]`

- [ ] **Step 1: 写失败测试**

```python
from desktop_robot.bridge.backends import LogBackend
from desktop_robot.bridge.dispatch import dispatch


def test_speak_records_text():
    b = LogBackend()
    status, body = dispatch("/v1/speak", {"text": "你好"}, b)
    assert status == 200
    assert body == {"ok": True}
    assert b.history[-1] == ("speak", {"text": "你好"})


def test_face_and_look():
    b = LogBackend()
    assert dispatch("/v1/face", {"face": "happy"}, b)[0] == 200
    assert dispatch("/v1/look", {"yaw": 20, "pitch": 0}, b)[0] == 200
    assert b.history[0][0] == "set_face"
    assert b.history[1] == ("look", {"yaw": 20.0, "pitch": 0.0})


def test_missing_text_is_400():
    status, body = dispatch("/v1/speak", {}, LogBackend())
    assert status == 400
    assert body["ok"] is False
    assert "missing_text" in body["reason"]


def test_unknown_path_404():
    status, body = dispatch("/v1/nope", {}, LogBackend())
    assert status == 404
    assert body["ok"] is False
```

- [ ] **Step 2: 运行确认失败**

```bash
source .venv/bin/activate
pytest tests/test_xiaozhi_bridge.py -v
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 backends + dispatch**

`backends.py`：`LogBackend` 只记 `history`；可选 `tts_cmd: list[str] | None`，`speak` 时若设置则 `subprocess.run`（超时 8s，失败忽略，不抛给 HTTP）。

`dispatch.py`：按 path 调 backend；`look` 缺省 yaw/pitch 为 0；非法 JSON 字段类型返回 400。

- [ ] **Step 4: 测试通过**

```bash
pytest tests/test_xiaozhi_bridge.py -v
```

Expected: PASS

---

### Task 2: HTTP 服务 + 与 XiaozhiHttpBody 联调

**Files:**
- Create: `src/desktop_robot/bridge/http_server.py`
- Modify: `tests/test_xiaozhi_bridge.py`

**Interfaces:**
- Consumes: `dispatch`
- Produces: `serve_bridge(host, port, backend) -> http.server.HTTPServer`（调用方可 `serve_forever`）；测试用 `start_in_thread(server)`

- [ ] **Step 1: 追加失败测试**

```python
import httpx
from desktop_robot.body.types import BodyCommand
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody
from desktop_robot.bridge.backends import LogBackend
from desktop_robot.bridge.http_server import make_server


def test_xiaozhi_http_body_against_local_bridge():
    backend = LogBackend()
    server = make_server("127.0.0.1", 0, backend)
    host, port = server.server_address[:2]
    thread = __import__("threading").Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = httpx.Client(base_url=f"http://{host}:{port}", timeout=5.0)
        body = XiaozhiHttpBody(client=client)
        r = body.execute(BodyCommand(action="speak", payload={"text": "hi"}))
        assert r.ok is True
        assert backend.history[-1][0] == "speak"
    finally:
        server.shutdown()
```

- [ ] **Step 2: 实现 `make_server`**

仅处理 `POST`；其它方法 405。读 body 为 JSON；非 JSON → 400 `invalid_json`。响应 `Content-Type: application/json`。

- [ ] **Step 3: pytest 通过**

```bash
pytest tests/test_xiaozhi_bridge.py -v
```

Expected: PASS

---

### Task 3: CLI + 冒烟文档

**Files:**
- Create: `src/desktop_robot/bridge/__main__.py`
- Modify: `scripts/smoke_xiaozhi.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `python -m desktop_robot.bridge --host 127.0.0.1 --port 8787 --tts say`

`--tts say` 仅在 Darwin 使用 `["say", "-v", "Ting-Ting"]` 作为 `LogBackend.tts_cmd`；其它系统忽略并打印提示。

- [ ] **Step 1: 实现 `__main__.py`**
- [ ] **Step 2: 更新 README / smoke：先起桥，再 `--body xiaozhi`**
- [ ] **Step 3: 全量 pytest**

```bash
pytest tests/ -v
```

Expected: PASS
