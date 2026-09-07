# 自学习桌面机器人 Implementation Plan

> **项目根目录:** `/Users/caijianfeng/PycharmProjects/desktop-robot`（独立仓库）。路径相对本仓库根；无嵌套子目录前缀。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地可测试的自研 Brain（记忆 + 技能权重）与统一 Body API；先用假 Body，再接小智 ESP32 Body，最后迁到便宜 Linux 一体机。

**Architecture:** Brain / Body / Memory 三层；Body 命令为 JSON（`speak` / `set_face` / `look` / `move`），返回 `ok|fail`；学习只写 SQLite。0 期经 Wi‑Fi 适配小智；1 期进程内调用同一 schema。

**Tech Stack:** Python 3.11+、SQLite、pytest、httpx、云端 OpenAI 兼容 LLM API；0 期硬件参考 `78/xiaozhi-esp32`；可选 MCP/HTTP 桥。

**Spec:** `docs/superpowers/specs/2026-09-07-self-learning-desktop-robot-design.md`

## Global Constraints

- 预算目标 ≤ ¥500；1 期不做本地大模型默认路径、不做履带实车
- 记忆写入仅来自明确陈述 / 纠正 / 用户确认；支持忘掉与清空
- 技能权重：成功 +1、失败 −1；同意图优先高权重；禁止危险/付费自动执行
- API Key 与语音原始数据不进 git；提交信息用简体中文 Conventional Commits
- 代码根目录：本仓库根目录（`/Users/caijianfeng/PycharmProjects/desktop-robot`）

---

## File Structure

```text

├── README.md
├── pyproject.toml
├── requirements.txt
├── .env.example
├── src/desktop_robot/
│   ├── __init__.py
│   ├── body/
│   │   ├── __init__.py
│   │   ├── types.py          # BodyCommand / BodyResult
│   │   ├── base.py           # BodyClient protocol
│   │   ├── fake.py           # FakeBody
│   │   └── xiaozhi_http.py   # 0 期 HTTP 适配（Task 5）
│   ├── memory/
│   │   ├── __init__.py
│   │   └── store.py          # SQLite 偏好 / 轨迹 / 权重
│   ├── learn/
│   │   ├── __init__.py
│   │   └── engine.py         # 权重更新与路径选择
│   ├── skills/
│   │   ├── __init__.py
│   │   ├── registry.py
│   │   └── builtin.py        # time / set_preference / forget
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── openai_compat.py
│   └── brain/
│       ├── __init__.py
│       ├── planner.py        # 文本 → 计划（工具序列）
│       └── loop.py           # 单轮编排
└── tests/
    ├── test_body_types.py
    ├── test_fake_body.py
    ├── test_memory_store.py
    ├── test_learn_engine.py
    ├── test_planner.py
    ├── test_loop_contract.py
    └── test_xiaozhi_http.py
```

---

### Task 1: 工程脚手架 + Body API 类型与假 Body

**Files:**
- Create: `pyproject.toml`
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `README.md`
- Create: `src/desktop_robot/__init__.py`
- Create: `src/desktop_robot/body/__init__.py`
- Create: `src/desktop_robot/body/types.py`
- Create: `src/desktop_robot/body/base.py`
- Create: `src/desktop_robot/body/fake.py`
- Test: `tests/test_body_types.py`
- Test: `tests/test_fake_body.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `BodyCommand(action: Literal["speak","set_face","look","move"], payload: dict, timeout_s: float = 5.0)`
  - `BodyResult(ok: bool, reason: str = "", data: dict | None = None)`
  - `BodyClient.execute(cmd: BodyCommand) -> BodyResult`
  - `FakeBody` 实现 `BodyClient`，记录 `history: list[BodyCommand]`

- [ ] **Step 1: 写失败测试（类型与 FakeBody）**

```python
# tests/test_body_types.py
from desktop_robot.body.types import BodyCommand, BodyResult

def test_speak_command_roundtrip_fields():
    cmd = BodyCommand(action="speak", payload={"text": "你好"}, timeout_s=3.0)
    assert cmd.action == "speak"
    assert cmd.payload["text"] == "你好"

def test_result_fail_has_reason():
    r = BodyResult(ok=False, reason="tts_timeout")
    assert r.ok is False
    assert r.reason == "tts_timeout"
```

```python
# tests/test_fake_body.py
from desktop_robot.body.fake import FakeBody
from desktop_robot.body.types import BodyCommand

def test_fake_body_records_and_ok():
    body = FakeBody()
    r = body.execute(BodyCommand(action="set_face", payload={"face": "happy"}))
    assert r.ok is True
    assert body.history[-1].action == "set_face"

def test_fake_body_can_force_fail():
    body = FakeBody(fail_actions={"look"})
    r = body.execute(BodyCommand(action="look", payload={"yaw": 20}))
    assert r.ok is False
    assert r.reason == "forced_fail"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" 2>/dev/null || pip install pytest
PYTHONPATH=src pytest tests/test_body_types.py tests/test_fake_body.py -v
```

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现最小代码**

`pyproject.toml` 要点：

```toml
[project]
name = "desktop-robot"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["httpx>=0.27", "pydantic>=2.0"]

[project.optional-dependencies]
dev = ["pytest>=8.0"]

[tool.setuptools.packages.find]
where = ["src"]
```

`body/types.py`：

```python
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field

BodyAction = Literal["speak", "set_face", "look", "move"]

class BodyCommand(BaseModel):
    action: BodyAction
    payload: dict[str, Any] = Field(default_factory=dict)
    timeout_s: float = 5.0

class BodyResult(BaseModel):
    ok: bool
    reason: str = ""
    data: dict[str, Any] | None = None
```

`body/base.py`：

```python
from typing import Protocol
from .types import BodyCommand, BodyResult

class BodyClient(Protocol):
    def execute(self, cmd: BodyCommand) -> BodyResult: ...
```

`body/fake.py`：

```python
from .types import BodyCommand, BodyResult

class FakeBody:
    def __init__(self, fail_actions: set[str] | None = None) -> None:
        self.history: list[BodyCommand] = []
        self.fail_actions = fail_actions or set()

    def execute(self, cmd: BodyCommand) -> BodyResult:
        self.history.append(cmd)
        if cmd.action in self.fail_actions:
            return BodyResult(ok=False, reason="forced_fail")
        return BodyResult(ok=True)
```

- [ ] **Step 4: 再跑测试**

```bash
source .venv/bin/activate
pip install -e ".[dev]"
pytest tests/test_body_types.py tests/test_fake_body.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop-robot
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 添加 Body API 类型与 FakeBody

EOF
)"
```

---

### Task 2: Memory Store（偏好 + 轨迹 + 权重表）

**Files:**
- Create: `src/desktop_robot/memory/__init__.py`
- Create: `src/desktop_robot/memory/store.py`
- Test: `tests/test_memory_store.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `MemoryStore(db_path: str)`
  - `set_fact(key: str, value: str, source: str) -> None`（覆盖写，带 `updated_at`）
  - `get_fact(key: str) -> str | None`
  - `delete_fact(key: str) -> bool`
  - `list_facts(prefix: str = "") -> dict[str, str]`
  - `add_trace(intent: str, steps_json: str, ok: bool, reason: str, session_id: str) -> int`
  - `get_weight(intent: str, path_key: str) -> int`
  - `set_weight(intent: str, path_key: str, weight: int) -> None`
  - `clear_all() -> None`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_memory_store.py
from pathlib import Path
from desktop_robot.memory.store import MemoryStore

def test_set_get_overwrite_fact(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    store.set_fact("user.call_me", "小明", source="user_confirm")
    store.set_fact("user.call_me", "阿明", source="user_correct")
    assert store.get_fact("user.call_me") == "阿明"

def test_delete_and_clear(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    store.set_fact("prefer.reply_short", "true", source="user_say")
    assert store.delete_fact("prefer.reply_short") is True
    store.set_fact("a", "1", source="user_say")
    store.clear_all()
    assert store.get_fact("a") is None

def test_weight_and_trace(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    assert store.get_weight("greeting", "face+speak") == 0
    store.set_weight("greeting", "face+speak", 2)
    assert store.get_weight("greeting", "face+speak") == 2
    tid = store.add_trace("greeting", '["set_face","speak"]', True, "", "s1")
    assert tid >= 1
```

- [ ] **Step 2: 运行确认失败**

```bash
source .venv/bin/activate
pytest tests/test_memory_store.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现 `MemoryStore`**

使用标准库 `sqlite3`。建表：

```sql
CREATE TABLE IF NOT EXISTS facts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_weights (
  intent TEXT NOT NULL,
  path_key TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (intent, path_key)
);
CREATE TABLE IF NOT EXISTS skill_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  ok INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

`set_fact` 用 `INSERT ... ON CONFLICT(key) DO UPDATE`；时间用 UTC ISO8601。

- [ ] **Step 4: 测试通过**

```bash
pytest tests/test_memory_store.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/memory tests/test_memory_store.py
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 实现 SQLite MemoryStore

EOF
)"
```

---

### Task 3: Learn Engine（权重更新与路径选择）

**Files:**
- Create: `src/desktop_robot/learn/__init__.py`
- Create: `src/desktop_robot/learn/engine.py`
- Test: `tests/test_learn_engine.py`

**Interfaces:**
- Consumes: `MemoryStore.get_weight` / `set_weight` / `add_trace`
- Produces:
  - `path_key(steps: list[str]) -> str`（`"+".join(steps)`）
  - `LearnEngine(store: MemoryStore, explore_prob: float = 0.1)`
  - `record(intent: str, steps: list[str], ok: bool, reason: str, session_id: str) -> None`
  - `choose_path(intent: str, candidates: list[list[str]], rng: random.Random | None = None) -> list[str]`
    - 无探索时选权重最高；并列取稳定排序第一；以 `explore_prob` 随机选其他候选

- [ ] **Step 1: 写失败测试**

```python
import random
from pathlib import Path
from desktop_robot.memory.store import MemoryStore
from desktop_robot.learn.engine import LearnEngine, path_key

def test_record_success_increments(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    eng = LearnEngine(store, explore_prob=0.0)
    steps = ["set_face", "speak"]
    eng.record("greeting", steps, ok=True, reason="", session_id="s1")
    assert store.get_weight("greeting", path_key(steps)) == 1
    eng.record("greeting", steps, ok=False, reason="tts_timeout", session_id="s2")
    assert store.get_weight("greeting", path_key(steps)) == 0

def test_choose_prefers_higher_weight(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    eng = LearnEngine(store, explore_prob=0.0)
    a, b = ["speak"], ["set_face", "speak"]
    store.set_weight("greeting", path_key(a), 1)
    store.set_weight("greeting", path_key(b), 5)
    chosen = eng.choose_path("greeting", [a, b], rng=random.Random(0))
    assert chosen == b
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest tests/test_learn_engine.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现 `learn/engine.py`**

```python
def path_key(steps: list[str]) -> str:
    return "+".join(steps)

class LearnEngine:
    def __init__(self, store, explore_prob: float = 0.1) -> None:
        self.store = store
        self.explore_prob = explore_prob

    def record(self, intent, steps, ok, reason, session_id) -> None:
        key = path_key(steps)
        w = self.store.get_weight(intent, key)
        self.store.set_weight(intent, key, w + (1 if ok else -1))
        self.store.add_trace(intent, __import__("json").dumps(steps, ensure_ascii=False), ok, reason, session_id)

    def choose_path(self, intent, candidates, rng=None):
        import random
        rng = rng or random.Random()
        if not candidates:
            raise ValueError("candidates empty")
        scored = sorted(
            ((self.store.get_weight(intent, path_key(c)), i, c) for i, c in enumerate(candidates)),
            key=lambda t: (-t[0], t[1]),
        )
        best = scored[0][2]
        if len(candidates) > 1 and rng.random() < self.explore_prob:
            others = [c for c in candidates if c != best]
            return rng.choice(others)
        return best
```

（实现时可把 `json` 提到模块顶层 import。）

- [ ] **Step 4: 测试通过**

```bash
pytest tests/test_learn_engine.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/learn tests/test_learn_engine.py
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 实现技能权重学习引擎

EOF
)"
```

---

### Task 4: Skills + Planner + 单轮 Loop（假 Body 契约）

**Files:**
- Create: `src/desktop_robot/skills/__init__.py`
- Create: `src/desktop_robot/skills/registry.py`
- Create: `src/desktop_robot/skills/builtin.py`
- Create: `src/desktop_robot/llm/__init__.py`
- Create: `src/desktop_robot/llm/base.py`
- Create: `src/desktop_robot/llm/openai_compat.py`
- Create: `src/desktop_robot/brain/__init__.py`
- Create: `src/desktop_robot/brain/planner.py`
- Create: `src/desktop_robot/brain/loop.py`
- Test: `tests/test_planner.py`
- Test: `tests/test_loop_contract.py`

**Interfaces:**
- Consumes: `BodyClient`, `MemoryStore`, `LearnEngine`
- Produces:
  - `SkillContext(store, body)`；内置技能 `get_time` / `set_preference` / `forget_preference`
  - `Planner.plan(user_text: str, facts: dict[str,str]) -> Plan`，其中 `Plan(intent: str, candidates: list[list[str]], reply: str)`
  - 第一版 Planner 用规则+可选 LLM：无 Key 时纯规则（问候 / 改称呼 / 问时间 / 看我）
  - `ConversationLoop.run_turn(user_text: str, session_id: str) -> TurnResult`
  - 流程：读 facts → plan → `choose_path` → 逐步执行（body 动作或 skills）→ `record` → 若 reply 则 `speak`

规则意图映射（无 LLM 时必须可用）：

| 用户文本含 | intent | candidates |
|------------|--------|------------|
| 你好/嗨 | `greeting` | `[["set_face","speak"], ["speak"]]` |
| 叫我X / 以后叫我X | `set_name` | `[["set_preference","speak"]]` |
| 几点/时间 | `ask_time` | `[["get_time","speak"]]` |
| 看看我/看我 | `look_at_user` | `[["look","set_face","speak"], ["speak"]]` |

- [ ] **Step 1: 写失败测试**

```python
# test_planner.py
from desktop_robot.brain.planner import RulePlanner

def test_greeting_plan():
    p = RulePlanner().plan("你好啊", {})
    assert p.intent == "greeting"
    assert ["speak"] in p.candidates or any("speak" in c for c in p.candidates)

def test_set_name_plan():
    p = RulePlanner().plan("以后叫我阿明", {})
    assert p.intent == "set_name"
```

```python
# test_loop_contract.py
from pathlib import Path
from desktop_robot.body.fake import FakeBody
from desktop_robot.memory.store import MemoryStore
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.brain.loop import ConversationLoop

def test_turn_updates_name_memory(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody()
    loop = ConversationLoop(store=store, body=body, learn=LearnEngine(store, explore_prob=0.0))
    loop.run_turn("以后叫我阿明", session_id="s1")
    assert store.get_fact("user.call_me") == "阿明"
    assert any(c.action == "speak" for c in body.history)

def test_failed_look_recorded(tmp_path: Path):
    store = MemoryStore(str(tmp_path / "m.db"))
    body = FakeBody(fail_actions={"look"})
    loop = ConversationLoop(store=store, body=body, learn=LearnEngine(store, explore_prob=0.0))
    loop.run_turn("看看我", session_id="s2")
    # 权重应下降或路径失败可查
    assert store.get_weight("look_at_user", "look+set_face+speak") <= 0
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest tests/test_planner.py tests/test_loop_contract.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现 skills / planner / loop**

要点：
- `set_preference` 解析「叫我XXX」写入 `user.call_me`，`source="user_correct"`
- `speak` 的文本：若有 `user.call_me`，问候里带上称呼
- 任一步 `BodyResult.ok is False`：中止后续步骤，`record(..., ok=False, reason=...)`
- `llm/openai_compat.py`：读环境变量 `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`；无 Key 时 Loop 只用 `RulePlanner`
- `.env.example` 写出上述变量，勿提交真实 Key

- [ ] **Step 4: 测试通过**

```bash
pytest tests/ -v
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop-robot
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 规则 Planner 与假 Body 对话闭环

EOF
)"
```

---

### Task 5: 小智 Body HTTP 适配（0 期过渡）

**Files:**
- Create: `src/desktop_robot/body/xiaozhi_http.py`
- Create: `scripts/smoke_xiaozhi.md`
- Test: `tests/test_xiaozhi_http.py`

**Interfaces:**
- Consumes: `BodyCommand` / `BodyResult`；`httpx.Client`
- Produces: `XiaozhiHttpBody(base_url: str, token: str | None = None)`
  - 将 `speak` / `set_face` / `look` 映射为可配置的 HTTP 路径（默认假设本地桥 `http://127.0.0.1:8787`）
  - 映射表放构造参数 `routes: dict[str, str]`，默认：
    - `speak` → `POST /v1/speak` body `{"text": ...}`
    - `set_face` → `POST /v1/face` body `{"face": ...}`
    - `look` → `POST /v1/look` body `{"yaw","pitch"}`
    - `move` → 返回 `BodyResult(ok=False, reason="not_implemented")`
  - HTTP 非 2xx 或超时 → `ok=False`，`reason` 含状态码或 `timeout`

说明：小智原版固件未必自带该 REST；本任务实现的是 **适配层 + 契约**。实机时二选一：(a) 用 py-xiaozhi/MCP 写薄桥转发到上述路由；(b) 改 `routes` 对齐你的桥。文档写在 `scripts/smoke_xiaozhi.md`。

- [ ] **Step 1: 写失败测试（用 httpx mock 传输）**

```python
import httpx
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody
from desktop_robot.body.types import BodyCommand

def test_speak_posts_json():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v1/speak"
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport, base_url="http://test")
    body = XiaozhiHttpBody(client=client)
    r = body.execute(BodyCommand(action="speak", payload={"text": "hi"}))
    assert r.ok is True

def test_http_error_maps_fail():
    transport = httpx.MockTransport(lambda r: httpx.Response(500, text="boom"))
    client = httpx.Client(transport=transport, base_url="http://test")
    body = XiaozhiHttpBody(client=client)
    r = body.execute(BodyCommand(action="set_face", payload={"face": "sad"}))
    assert r.ok is False
    assert "500" in r.reason
```

- [ ] **Step 2: 运行确认失败**

```bash
pytest tests/test_xiaozhi_http.py -v
```

Expected: FAIL

- [ ] **Step 3: 实现适配器 + 冒烟文档**

`smoke_xiaozhi.md` 写清：刷 `78/xiaozhi-esp32` → 起本地桥 → `ConversationLoop(..., body=XiaozhiHttpBody(...))` → 说「你好」。

- [ ] **Step 4: 测试通过**

```bash
pytest tests/test_xiaozhi_http.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/body/xiaozhi_http.py tests/test_xiaozhi_http.py scripts/smoke_xiaozhi.md
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 添加小智 HTTP Body 适配层

EOF
)"
```

---

### Task 6: CLI 入口 + README 验收清单（软件 MVP 完成）

**Files:**
- Create: `src/desktop_robot/__main__.py`
- Modify: `README.md`
- Test: 手工 + 现有 pytest

**Interfaces:**
- Consumes: Task 1–5 全部
- Produces: `python -m desktop_robot --db ./data/robot.db --body fake` 文本 REPL；`--body xiaozhi --body-url http://127.0.0.1:8787`

- [ ] **Step 1: 实现 `__main__.py` REPL**

读一行用户输入 → `run_turn` → 打印 `TurnResult`（intent、chosen path、ok、facts 摘要）。空行退出。

- [ ] **Step 2: README 写清**

- 安装：`pip install -e ".[dev]"`
- 假 Body 自测：`pytest` + `python -m desktop_robot --body fake`
- 学习验收：输入「以后叫我阿明」→ 再「你好」应带称呼；用 FakeBody `fail_actions` 验证权重变化（可用一小段 `python -c` 示例）
- 开源复用指向 spec §9

- [ ] **Step 3: 全量测试**

```bash
pytest tests/ -v
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add desktop-robot
git commit -m "$(cat <<'EOF'
feat(desktop-robot): 添加 CLI 与 MVP 使用说明

EOF
)"
```

---

### Task 7:（硬件里程碑，可另开 PR）1 期 Linux 一体机清单

本任务不写应用代码，产出清单文档即可。

**Files:**
- Create: `docs/phase1-hardware-checklist.md`

- [ ] **Step 1: 按 spec §3.2 写采购与接线清单**（主控 / 屏 / 麦喇叭 / SG90×2 / 5V≥3A）
- [ ] **Step 2: 写部署步骤**：把同一 `desktop-robot` 装到板上；`body` 从 `xiaozhi` 换为板上本地驱动（新建 `body/local_gpio.py` 可列为 follow-up）
- [ ] **Step 3: Commit**

```bash
git add docs/phase1-hardware-checklist.md
git commit -m "$(cat <<'EOF'
docs(desktop-robot): 添加 1 期硬件采购与部署清单

EOF
)"
```

---

## Spec Coverage（自审）

| Spec 项 | 任务 |
|---------|------|
| Body API schema | Task 1 |
| Fake Body 契约 | Task 1、4 |
| Memory 偏好 / 忘掉 / 清空 | Task 2、4 |
| 技能权重 ±1 与路径选择 | Task 3、4 |
| 单轮数据流 | Task 4、6 |
| 异常：body 失败记 reason | Task 4 |
| 小智 0 期过渡 | Task 5 + spec §9 |
| 云端 LLM 预留 | Task 4 `openai_compat` |
| 1 期硬件 ≤¥500 | Task 7 |
| 2 期履带 / LeRobot | 明确不在本计划（YAGNI） |

## Placeholder 扫描

无 TBD；小智 REST 路径以可配置 `routes` + 桥文档处理，避免绑死未公开的固件 HTTP。

---

## 执行方式

Plan complete and saved to `docs/superpowers/plans/2026-09-07-self-learning-desktop-robot.md`.

**两种执行方式：**

1. **Subagent-Driven（推荐）** — 每个 Task 派一个新子代理，Task 之间人工/父代理复查  
2. **Inline Execution** — 本会话按 executing-plans 连续做，设检查点  

要先改计划内容，还是直接选一种开始实现？
