# 三维机架 · 阶段二至四实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在阶段一与 Phase A 蓝图数据之上，交付可编辑的四轮机架+两关节臂、可感知结构差异的试验场，以及「抽屉取物」三种机制可解的挑战。

**Architecture:** 浏览器以蓝图为唯一装配真相：`editor/` 生成/编辑实例与连接；`simulation/` 用**简化刚体**（AABB 碰撞、质心倾覆、关节角限位、抓取/推/拖约束）驱动，不在本轮锁定 Rapier（规格允许原型后再选型）。Python 扩展 `missions` 结果判定与蓝图保存 API；旧格子委托保留兼容模式。

**Tech Stack:** 现有 Three.js（已 vendor）、`parts.py`/`blueprints.py`、原生 ESM、pytest / node:test。本轮**不**新增 npm 依赖或 Rapier WASM。

## Global Constraints

- 依据：`docs/superpowers/specs/2026-09-22-3d-chassis-optimization.md` §6 阶段二～四、§7 验收；`2026-09-21-freeform-robot-workshop-redesign.md` §5–8、§9。
- 蓝图为装配事实来源；`equipped` 继续由蓝图派生以兼容旧任务。
- 单位 m/kg/s；Y 上、局部 +Z 前；连接树无环。
- 游戏蓝图不可制造、不发真机指令。
- 试验场无需接委托即可进入；挑战按物体区域结果判定，不检查指定零件清单。
- 旧三关格子玩法保留可玩；新试验/挑战走连续简化物理。

## File Structure

```text
src/desktop_robot/game/
  missions_open.py      # 开放挑战定义与结果判定（抽屉取物）
  engine.py             # 扩展 action: save_blueprint / enter_yard / challenge_* 

src/desktop_robot/studio/static/game/
  editor/
    commandHistory.mjs  # undo/redo
    assemble.mjs        # 吸附、放置、旋转、拆卸
    templates.mjs       # 四轮底盘 + 两关节臂预制
  simulation/
    world.mjs           # 坡道/窄门/方块/抽屉 AABB
    body.mjs            # 从蓝图建刚体树、质心、轮距宽度
    drive.mjs           # 速度输入、关节驱动
    grasp.mjs           # 抓/推/拖
    tip.mjs             # 倾覆判定与失败原因
  workshop/
    editorScene.mjs     # 建造模式 Three 场景
    yardScene.mjs       # 试验/挑战场景
  game.js / game.html / game.css  # 入口：改装→蓝图编辑、试验场、挑战
```

---

### Task 1: 预制四轮+两关节臂蓝图模板

**Files:**
- Create: `src/desktop_robot/studio/static/game/editor/templates.mjs`
- Create: `tests/test_game_templates.mjs`
- Modify: `src/desktop_robot/game/blueprints.py`（可选 `quad_chassis_arm_blueprint()` 供服务端校验）

**Produces:**
- `buildQuadChassisArmTemplate()` → plain object `{id,name,root_instance_id,instances,connections,bindings}` 可 `Blueprint.model_validate`
- 含：1×core、4×wheel、板/梁、2×revolute_joint、1×beam、1×gripper（连接合法、`validate_blueprint` 空）

- [ ] **Step 1: 失败测试** — 断言模板 validate 通过、wheel 实例数 4、含两个 revolute_joint 与 gripper  
- [ ] **Step 2–4: 实现（前后端各一或仅前端+Python 镜像）**  
- [ ] **Step 5: Commit** `feat(game): 四轮机架与两关节臂预制蓝图`

---

### Task 2: 命令历史与蓝图编辑 API

**Files:**
- Create: `editor/commandHistory.mjs`、`editor/assemble.mjs`
- Modify: `engine.py` — actions: `blueprint_replace`（整表替换 active 蓝图，先 validate）、`blueprint_rename`
- Test: `tests/test_game_editor_history.mjs`、`tests/test_game.py`

**Produces:**
- `CommandHistory.push/undo/redo` 原子恢复 instances+connections
- `attachPart(bp, partId, parentInstanceId, parentPointId)` / `detachSubtree` / `rotateInstance(yawStep)`
- 服务端 `blueprint_replace`：校验无环后写入；失败不改 revision 内容

- [ ] **Step 1–5: TDD + commit** `feat(game): 蓝图装配命令与服务端替换保存`

---

### Task 3: 三维编辑场景与 UI 入口

**Files:**
- Create: `workshop/editorScene.mjs`
- Modify: `game.html` / `game.js` / `game.css` — 视图 `build`：零件库、场景点选、撤销/重做、应用四轮模板、保存、进入试验场

**Produces:**
- 按蓝图实例生成盒体网格；高亮选中与连接点小球
- 拖入/点击连接点放置（窄屏：选零件→点连接点）
- 保存调用 `blueprint_replace`；刷新后结构一致（pytest + 手动清单）

- [ ] **Step 1–5: Commit** `feat(game): 三维蓝图建造视图`

---

### Task 4: 简化物理核心（质心、碰撞、关节、倾覆）

**Files:**
- Create: `simulation/body.mjs`、`tip.mjs`、`drive.mjs`
- Test: `tests/test_game_sim_body.mjs`

**Produces:**
- `buildSimFromBlueprint(bp, partDefs)` → links with mass、AABB、joint axes/limits、wheelbase、width、com
- `stepDrive(state, input, dt)` 平面速度+转向（受 width 影响窄门）
- `checkTip(state, heldMass)` → `{tipped, reason}`
- 断言：长臂 `reach` 更大；宽轮距 `width` 更大；载荷前移更易 tip

- [ ] **Step 1–5: Commit** `feat(game): 蓝图驱动的简化物理度量与倾覆`

---

### Task 5: 试验场场景与复位

**Files:**
- Create: `simulation/world.mjs`、`workshop/yardScene.mjs`、`simulation/grasp.mjs`
- Modify: `engine.py` — `enter_yard` / `exit_yard` 保存编辑快照；不覆盖蓝图 unless 显式保存姿态
- Modify: `game.js` — 视图 `yard`：WASD/方向驱动、关节键、抓取、扶正、回起点、回编辑

**Produces:**
- 平地、坡道 AABB、窄门（宽度阈值）、可搬方块
- 抓取：夹爪与方块距离+朝向；推：接触位移；钩：拖拽约束
- 失败 toast 使用 tip/grasp 原因文案
- 复位：机器人位姿与方块回初始；编辑快照恢复

- [ ] **Step 1–5: Commit** `feat(game): 物理试验场与快速复位`

---

### Task 6: 抽屉取物多解挑战

**Files:**
- Create: `missions_open.py`
- Modify: `engine.py` — `start_challenge` / `submit_challenge`（校验 run_id、蓝图版本、结果幂等发奖）
- Modify: `yardScene` / `world.mjs` — 抽屉缝、方块、接收区
- Test: `tests/test_game_challenge.py`

**Produces:**
- 挑战 id `drawer-block`：目标方块进入 receive 区且速度≈0
- **不**检查 equipped 清单；奖励首次结算幂等
- 三种机制在 sim 层可区分：`grasp` / `push` / `drag` 成功路径各有单元测（用脚本化输入或直接设约束）

- [ ] **Step 1–5: Commit** `feat(game): 抽屉取物多解挑战与结果结算`

---

### Task 7: 验收用例与文档勾选

**Files:**
- `tests/test_game_phase2_acceptance.mjs`（臂长 reach、轮距/窄门、三种解法）
- 更新规格文档验收清单为已实现项打勾（仅改 `2026-09-22-3d-chassis-optimization.md` §7 中本轮真正做到的条目）

- [x] **Step 1–5: Commit** `test(game): 阶段二至四验收用例`

**Status (2026-09-23):** 验收用例与 §7 可证条目已勾选；穿透/设备性能/玩家研究仍待 playtest。

---

## Spec Coverage

| 阶段 | 任务 |
| --- | --- |
| 二 四轮+臂+编辑+保存 | 1–3 |
| 三 试验场物理+复位 | 4–5 |
| 四 抽屉三解法 | 6–7 |
| Rapier / 材质音效 / 社区 | **不做** |

## Rapier 说明

本计划采用简化物理以满足「结构改变行为」验收；若后续原型证明需 Rapier，另开计划替换 `simulation/*` 后端，保留蓝图与任务契约。

---

用户要求继续完成阶段二到四：计划写入后立即 Subagent-Driven 执行。
