# 选择技能生成机器人 Implementation Plan

> **For agentic workers:** 按任务顺序实现；每步可测。

**Goal:** 用户选默认套装或自创技能，生成护照 + SQLite，并用假 Body 按已装技能对话。

**Architecture:** 静态 `catalog` 定义技能与 grants；`passport.generate` 校验并落盘；`ConversationLoop` 有护照时过滤步骤；本地单页 HTTP 只负责生成。

**Tech Stack:** Python 3.11+、pydantic、stdlib http.server、现有 MemoryStore / FakeBody。

## Global Constraints

- 不做公演/真机；自制技能仅文案注入；无护照 = 全技能解锁（兼容现有测试）。

---

### Task 1: catalog + passport

- [ ] `skills/catalog.py` 静态目录
- [ ] `passport/` types / store / generate
- [ ] 测试：默认套装 / draft / 互斥 / 上限

### Task 2: loop 过滤 + CLI

- [ ] `ConversationLoop` 接受 grants，过滤步骤
- [ ] `__main__.py` `--passport`；draft 拒绝开聊
- [ ] 测试：无 look / 无 memory / 有 clock

### Task 3: 本地单页

- [ ] `studio/` 静态页 + `python -m desktop_robot.studio`
- [ ] 生成 API 写 `data/robots/<id>/`
