# 玩家自主设计 · 阶段 1：空机架与基础装配

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家可不依赖成品四轮臂模板，从空机架用基础件搭出不同结构，看见兼容连接点，并编辑梁长/板宽等首批参数。

**Architecture:** 蓝图仍为唯一结构源；空机架为仅 `core` 的 Blueprint；连接预览在编辑器按 kinds 过滤；`PartInstance.params` 驱动派生尺寸与连接点偏移，前后端共享限幅约定。

**Tech Stack:** 现有 game.js / assemble / editorScene / parts.py / blueprints.py；pytest + node:test。

## Global Constraints

- 依据：`2026-09-24-player-designed-mechanical-workshop.md` §9 阶段 1、§4、§10 前四项。
- 阶段 0 可靠性已合入；不得回退误导航/脏草稿保护。
- 模板仅作可拆教学示例，不得强制。
- 自制组件、驱动绑定、探索关卡属阶段 2+，本计划不做。
- 改装页 `equip` 覆盖自由蓝图：至少提示或隔离，避免静默清空。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `game/templates.py` + `editor/templates.mjs` | `empty_core_blueprint` / `buildEmptyCore` |
| `game.js` / `game.html` | 新建空机架、拆卸、参数面板、post 上架 |
| `editor/assemble.mjs` | 兼容点查询、params 默认、detach UI 接线 |
| `editor/params.mjs`（新） | 梁长/板宽限幅与派生 size |
| `workshop/editorScene.mjs` | 兼容点高亮、params 尺寸渲染 |
| `parts.py` / `blueprints.py` | 可选校验 params 上下限 |
| `tests/test_game_phase1_design.*` | 空机架、兼容点、参数派生 |

---

### Task 1: 空机架入口

- [ ] 前后端对称「仅 core」工厂
- [ ] 建造页按钮「新建空机架」→ 确认后替换草稿（进 undo）
- [ ] 四轮模板文案改为「教学模板（可拆改）」
- [ ] 测试：空机架 1 实例 0 连接；保存可过 validate

### Task 2: 连接兼容预览

- [ ] `compatibleParentPoints(bp, parentId, childPartId, defs)` 
- [ ] pending 零件时只高亮兼容且未占用点；点击不兼容给原因
- [ ] 测试：gripper 挂 wheel hub 失败/不可高亮；joint out 可挂 gripper

### Task 3: 立柱上架 + 拆卸

- [ ] 调色板加 `post`
- [ ] 工具栏「拆卸选中」（非 root）接 `detachSubtree`

### Task 4: 首批参数（梁长 / 板宽）

- [ ] `params.mjs`：`beam.length` 0.06–0.30；`plate.width` 0.06–0.20；默认与 `size_m` 对齐
- [ ] 编辑器与 sim 用派生尺寸；连接点沿长轴缩放
- [ ] 选中后属性面板改参数进 undo
- [ ] 测试：加长 beam 后两端点间距变大

### Task 5: 改装轨隔离提示

- [ ] 自由装配脏草稿时，改装页 equip 前 toast 警告（或跳过 sync 若 active 为自由蓝图）——最小实现：equip 前若蓝图非 classic 形态则 confirm

### Task 6: 提交与回归

- [ ] node + pytest 绿
- [ ] Commit 分条：feat 空机架；feat 连接预览；feat 参数面板

按用户「继续优化」立即执行，不等待确认。

## 实施记录

- 空机架：`empty_core_blueprint` / `buildEmptyCoreTemplate` +「新建空机架」按钮。
- 连接预览：`compatible.mjs` + 编辑器绿/灰标记与失败原因。
- 参数：梁长 / 板宽 / 立柱高；`params.mjs` 驱动尺寸与连接点。
- 立柱上架、拆卸选中；改装页不再覆盖自由装配 / 空机架蓝图。
- 测试：`tests/test_game_phase1_design.mjs`、空机架 validate、equip 保护。
