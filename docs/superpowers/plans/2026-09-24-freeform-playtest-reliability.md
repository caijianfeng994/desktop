# 第三轮试玩 · 作品可靠性与操作修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `2026-09-24-freeform-playtest-optimization.md` 第一阶段，修好「模板→保存→试验场」结构丢失与误导航覆盖草稿，并完成第二阶段必要的可操作修复（画布常驻、试验场取景、缺工具拦截）。

**Architecture:** 导航控件与页面状态属性分离；编辑草稿 `buildBp` 与已保存蓝图分离，脏标记阻止静默 `syncBuildFromState`；试验场进入前断言工具行为并自动取景。

**Tech Stack:** 现有 game.js / engine / yardScene；pytest + node:test。

## Global Constraints

- 依据：试玩规格 §4 P0、§5 P1、§7 第一/二阶段。
- 疑似根因（须用测试锁死）：`closest('[data-view]')` 命中 `body.dataset.view` → `navigate(build)` → `ensureBuildEditor` → `syncBuildFromState` 覆盖未保存模板。
- 不通过清空存档掩盖问题；保留旧委托兼容。
- 本计划不接 Rapier、不扩关卡内容。

## File Structure

| 文件 | 改动 |
| --- | --- |
| `game.js` | 导航选择器、草稿脏标记、保存状态、进入试验场守卫 |
| `game.html` | `data-nav` 或仅按钮 `data-view`；作品状态条 |
| `yardScene.mjs` | 按包围盒 `frameToRobot` |
| `game.css` | build 窄屏画布常驻 / 零件库折叠 |
| `tests/test_game_build_reliability.mjs` | 导航不匹配 body；脏草稿不被 sync 覆盖 |
| `tests/test_game.py` | 模板保存后 enter_yard 快照含 gripper |

---

### Task 1: 修复误导航（P0-02）

**Files:** Modify `game.js`、`game.html`；Test `tests/test_game_nav.mjs` 或 pytest 静态断言

**Fix:**
- 全局点击改为：`e.target.closest('button[data-view], a[data-view], .bottom-nav [data-view]')`  
  **禁止**匹配 `body` / `.screen`。
- 或将导航控件改为 `data-nav="build"`，body 继续只用 `data-view` 做样式。
- `navigate(sameView)`：若 `next===view` 且非 `force`，跳过 `ensureBuildEditor` 全量同步（可仍更新 chrome）。

- [ ] **Step 1:** 测试断言 HTML/JS 中导航选择器不包含裸 `[data-view]` 对任意祖先的匹配，或包含 `button[data-view]` 限定  
- [ ] **Step 2–4:** 实现  
- [ ] **Step 5:** Commit `fix(game): 导航仅响应明确控件避免覆盖草稿`

---

### Task 2: 草稿 / 已保存 / 试跑快照分离（P0-01）

**Files:** `game.js`、`game.html`、`tests/test_game.py`、`tests/test_game_build_reliability.mjs`

**Produces:**
- `buildDirty`：模板/装配/撤销后为 true；成功 `blueprint_replace` 后 false 并记录 `buildSavedRevision`
- `syncBuildFromState`：**若 dirty 则禁止覆盖**（除非 `force:true` 用于显式「从存档重新载入」）
- `ensureBuildEditor` 已存在场景时只 `resize`，不 sync（除非 !buildBp）
- UI：`#build-status` 显示作品名、实例数、`未保存|已保存|保存中|失败`
- pytest：`blueprint_replace` 四轮模板后 `enter_yard` 的 `yard_snapshot` 含 `gripper-1` 与 4 wheel
- node：模拟 dirty 时 sync 不改变实例数

- [ ] **Step 1–5:** Commit `fix(game): 分离编辑草稿与已保存蓝图并显示保存状态`

---

### Task 3: 试验场识别夹爪与缺工具守卫（P0-01 / P1）

**Files:** `yardScene.mjs`、`game.js`、`body.mjs`（若需）、测试

**Fix:**
- 进入试验场前：若 `buildDirty` 先自动保存；保存失败则中止并 toast
- `assertYardTools(bp, partDefs)`：存在 grasp/push/drag 行为之一，否则 toast「蓝图没有工具」并 `navigate('build')`，**不** `start_challenge`
- 单元测：四轮模板 + PART_DEFS → `buildSimFromBlueprint` 的 links 含 gripper behaviors grasp
- 若 behaviors 丢失：修 `indexPartDefs` / setBlueprint 传参

- [ ] **Step 1–5:** Commit `fix(game): 试验场校验工具并保证模板夹爪可识别`

---

### Task 4: 画布常驻与试验场取景（P1）

**Files:** `game.css`、`yardScene.mjs`、`game.html`

- 窄屏：`#build` 画布 `min-height` 常驻视口上半；零件库可折叠
- `YardScene.frameCameraToBounds()` 在 setBlueprint/reset 后调用
- Commit `fix(game): 建造画布常驻与试验场自动取景`

---

### Task 5: 回归测试清单自动化子集

- 新存档链路：模板→保存→yard 含 gripper（pytest）
- 点击非导航区域不改变 buildBp 实例数（node，通过导出小函数 `isNavClick(el)`）
- Commit `test(game): 第三轮作品可靠性回归`

---

## Spec Coverage

| 条目 | 任务 |
| --- | --- |
| P0-02 误导航 | 1 |
| P0-01 模板保存试验场一致 | 2–3 |
| P1 布局/取景/缺工具 | 3–4 |
| §7 第一/二阶段回归 | 5 |
| P2 物理扩内容 | **不做** |

---

按「按照优化方案执行」立即 Subagent-Driven 开工。
