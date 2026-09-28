# 机甲动作游戏改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-09-28-mecha-action-redesign.md` 完整落地机甲动作体验：可靠作品、可辨认机甲外形、第一/第三人称驾驶、战斗、书架救援闭环、流派解法与掉落改装，不做简化壳。

**Architecture:** 蓝图仍为唯一结构源；结构/功能/外观零件共用连接图。客户端负责高频驾驶、战斗、敌人步进；Python 管零件定义、存档、挑战判定、库存与设计图。渲染只读蓝图+运行态，禁止运行态写回草稿。

**Tech Stack:** 现有 Three.js 编辑器/试验场、纯 JS 模拟模块、Pydantic 零件目录、`/api/game` + `/api/game/action`、node:test + pytest。

## Global Constraints

- 外形变化必须真实改变轮廓与行为；主题皮肤 ≠ 机甲外形。
- 设计态 / 运行态 / 表现态分离；试验场用已保存快照。
- 第一人称可完成移动、瞄准、射击、抓取、交付；切镜不改物理状态。
- 首版战场为书架救援完整闭环；三解法（地面射击救援 / 绞盘 / 推进）均需可玩。
- 不接大型开放世界、联机、数百件装备；不默认换引擎。
- 用户未要求时不 `git commit`。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `game/parts.py` | 新增装甲/头/腿/背包/武器/推进/绞盘零件与区域挂点 |
| `game/templates.py` + `editor/templates.mjs` | 工程机甲模板（非经典小方） |
| `game/missions_open.py` + `engine.py` | 书架救援、掉落、设计图库存 |
| `workshop/partVisuals.mjs` | 机甲级程序化外形（面板/关节/炮管，非纯方块） |
| `workshop/mechaZones.mjs` | 装配区域标签与视野预览辅助 |
| `workshop/editorScene.mjs` | 区域提示、整机取景、视野预览开关 |
| `workshop/yardScene.mjs` | 驾驶舱稳定节点、战斗 HUD、敌人/子弹 |
| `simulation/combat.mjs` | 热量、弹药、弹道、命中 |
| `simulation/enemies.mjs` | 巡逻敌机决策与受击 |
| `simulation/world.mjs` | 倾斜书架、掩体、救援点、锚点 |
| `simulation/winch.mjs` / `thrust.mjs` | 绞盘与短时推进 |
| `game.js` / `game.html` / `game.css` | 机库 UX、出击入口、库存/设计图、任务 HUD |
| `tests/test_game_mecha_*.mjs` + pytest | 分阶段验收 |

---

### Task 1: 扩展核心挂点与机甲零件目录

**Files:**
- Modify: `src/desktop_robot/game/parts.py`
- Modify: `src/desktop_robot/studio/static/game/workshop/editorScene.mjs`（`PART_SIZES` / 调色）
- Test: `tests/test_game_parts.py` 或新增 `tests/test_game_mecha_parts.py`

**Produces:**
- `core` 增加：`slot_head`, `slot_shoulder_l`, `slot_shoulder_r`, `slot_backpack`, `slot_hip`（保留原 mount_*）
- 新零件 ID：`armor_torso`, `armor_shoulder`, `mecha_head`, `mecha_leg`, `backpack_frame`, `weapon_rifle`, `thruster_pack`, `winch_module`, `heavy_plate`
- 各自 `size_m`、`connection_points`、`behaviors`（`armor`/`weapon`/`thrust`/`winch`）、`mass_kg`、`owned_by_default`/`price`

- [x] **Step 1:** 写测试：新零件存在、挂点 kinds 可连、质量 > 0
- [x] **Step 2:** 实现零件目录与 engine `PART_DEFS` 暴露
- [x] **Step 3:** 测试通过

---

### Task 2: 机甲程序化外形（必须可辨认）

**Files:**
- Modify: `src/desktop_robot/studio/static/game/workshop/partVisuals.mjs`
- Modify: `src/desktop_robot/studio/static/game/workshop/materials.mjs`（装甲/武器预设）
- Test: `tests/test_game_mecha_visuals.mjs`（结构断言：关键 partId 返回 Group 且子 mesh ≥ N）

**Produces:**
- `createPartVisual` 对上述新零件生成多件拼装外形（斜面板、炮管、腿甲、头罩、喷口、绞盘卷筒）
- 升级既有 `core`/`wheel`/`revolute_joint`/`gripper` 细节，避免「三眼方块」作为默认机甲观感
- `placePartVisual` 语义不变

- [ ] **Step 1–3:** 失败测试 → 实现外形 → 绿

---

### Task 3: 工程机甲默认模板

**Files:**
- Modify: `src/desktop_robot/game/templates.py`
- Modify: `src/desktop_robot/studio/static/game/editor/templates.mjs`
- Modify: `game.js`（「装四轮模板」改为装工程机甲，或并列「装工程机甲」为主 CTA）
- Test: `tests/test_game_templates.py` + `tests/test_game_mecha_template.mjs`

**Produces:**
- `buildEngineerMechaTemplate()`：头+躯干甲+双肩+四轮/腿架+臂+夹爪+（可选空武器挂点）
- 蓝图可 `model_validate`；前端模板与 Python 同形
- 机库主按钮装此模板；经典小方可降为「更多」

- [ ] **Step 1–3:** 测试实例/连接数与区域覆盖 → 实现 → 绿

---

### Task 4: 机库区域、视野预览、取景验收

**Files:**
- Create: `workshop/mechaZones.mjs`
- Modify: `editorScene.mjs`, `game.html`, `hangarMetrics.mjs`
- Test: `tests/test_game_mecha_zones.mjs`

**Produces:**
- 区域枚举：`core|head|torso|arm_l|arm_r|chassis|backpack|shoulder_l|shoulder_r`
- 选中零件时高亮所属区域；空槽半透幽灵提示
- 「驾驶视野」开关：相机落到 core 前方稳定点，检测前方装甲遮挡并提示
- 右侧 metrics 增加装甲覆盖 / 武器槽 / 推进预算摘要

---

### Task 5: 驾驶舱稳定节点与配置化 HUD

**Files:**
- Modify: `yardScene.mjs`, `cameraRig.mjs`
- Test: `tests/test_game_mecha_cockpit.mjs`

**Produces:**
- `cockpitAnchor`：相对 core 前上方，不继承关节抖动（只跟底盘位姿）
- HUD：能源、热量、弹药、锁定、工具状态；无武器时隐藏弹药
- 切 follow/cockpit/orbit 不改 `drive`/`joints`/`held`

---

### Task 6: 战斗模拟（远程武器 + 热量弹药）

**Files:**
- Create: `simulation/combat.mjs`
- Modify: `yardScene.mjs`, `game.js`（射击输入）
- Test: `tests/test_game_mecha_combat.mjs`

**Produces:**
- `createCombatState()`, `tryFire()`, `stepProjectiles()`, `applyHit()`
- 武器来自蓝图 `weapon_rifle` 绑定；无武器不可射
- 热量过高停射；弹药耗尽需回机库补给（或场景补给点）

---

### Task 7: 巡逻敌机

**Files:**
- Create: `simulation/enemies.mjs`
- Modify: `yardScene.mjs` 生成/步进/受击闪白
- Test: `tests/test_game_mecha_enemies.mjs`

**Produces:**
- 一类敌：沿路径巡逻，进警戒后预警再射击
- HP、击毁、对玩家伤害与失败重试（不丢作品）

---

### Task 8: 书架救援战场与任务判定

**Files:**
- Modify: `simulation/world.mjs`, `missions_open.py`, `engine.py`, `yardScene.mjs`
- Test: pytest 挑战判定 + `tests/test_game_mecha_bookshelf.mjs`

**Produces:**
- 世界：倾斜书架、地面掩体、救援方块、接收区、敌巡逻点
- 挑战 `bookshelf-rescue`：击败或绕开敌 → 取回目标 → 交付
- 成功掉落：部件或设计图写入库存（见 Task 9）

---

### Task 9: 库存、设计图与多机体存档

**Files:**
- Modify: `engine.py` state schema + migrate
- Modify: `game.js` / `game.html` 库存与机体列表 UI
- Test: `tests/test_game.py` migrate + loot apply

**Produces:**
- `state.inventory.parts[]`, `state.blueprints_library[]`, `state.schematics[]`
- 掉落 `grant_loot` action；装配仅能使用已拥有零件（默认拥有工程套件）
- 多机体：`blueprints[]` 切换当前编辑目标，互不覆盖

---

### Task 10: 绞盘解法

**Files:**
- Create: `simulation/winch.mjs`
- Modify: parts（已有 `winch_module`）、yardScene、bindings
- Test: `tests/test_game_mecha_winch.mjs`

**Produces:**
- 瞄准锚点发射钩索，拉近自身或拉取物块
- 书架任务可用绞盘替代部分地面绕行

---

### Task 11: 短时推进解法

**Files:**
- Create: `simulation/thrust.mjs`
- Modify: yardScene、combat 热量耦合
- Test: `tests/test_game_mecha_thrust.mjs`

**Produces:**
- 燃料/热量限制的冲刺跳跃；可上书架第二层落点
- 落地伤害与失败复位不丢蓝图

---

### Task 12: 重甲/肩武与外形行为联检

**Files:**
- Modify: `heavy_plate`/`armor_*` 质量影响 drive；肩武改变射击点
- Test: `tests/test_game_mecha_archetypes.mjs`

**Produces:**
- 同一救援目标至少三条机制不同路径可通关（地面火力、绞盘、推进）
- 换底盘/手臂/背包后包围盒与标签变化可断言

---

### Task 13: 内容扩展与验收清单

**Files:**
- 第二敌人行为变体、机库作品摄影位、说明书文案
- 更新 spec 状态为「已实施」；跑通 §10 验证清单自动化子集

**Produces:**
- [ ] 基础件改装与组件复用
- [ ] 换件后轮廓+行为变化
- [ ] FP 完成移动/瞄准/战斗/抓取/交付
- [ ] 切镜不改命中与输入
- [ ] 视野遮挡提示
- [ ] 热量/受击反馈一致
- [ ] 存档/重试不丢作品
- [ ] Playwright 冒烟：装工程机甲 → 出击书架 → 击毁或绕开 → 救援交付 → 获掉落

---

## Spec Coverage Map

| Spec 节 | Tasks |
| --- | --- |
| §3 第一人称与展示 | 4, 5 |
| §4 自由装配与外形 | 1, 2, 3, 4 |
| §5 流派取舍 | 10, 11, 12 |
| §6 战斗与空间 | 6, 7, 8 |
| §7 书架救援 | 8, 10, 11, 12 |
| §8 技术分层 | 全程；9 存档 |
| §9 阶段 0–5 | 0=既有复测并入 9；1→3–5；2→6–7；3→8–9；4→10–12；5→13 |
| §10 验证清单 | 13 |

## Execution Notes

- 默认从 Task 1 顺序推进；Task 2/3 可与 Task 1 尾部并行。
- 每任务结束后跑对应测试；整阶段结束跑 Playwright 截图确认「像机甲」。
- 禁止再把「主题=机甲」当成外形交付。
