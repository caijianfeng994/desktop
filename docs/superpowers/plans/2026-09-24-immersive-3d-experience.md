# 沉浸式 3D 体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `2026-09-24-immersive-3d-experience.md` 补齐真实机械感：作品可靠闭环、看清空间的镜头与布局、可信坡面/驾驶/抓取/负载，以及材质阴影与机械声音。

**Architecture:** 继续用蓝图驱动编辑器与试验场；物理保持简化步进（不接 Rapier）。新增 `terrain`（高度场）、强化 `drive`（惯性/负载/轮速）、`materials`/`sfx` 表现层；编辑与试验场相机模块化，渲染只同步模拟状态。

**Tech Stack:** Three.js（已有）、纯 JS 模拟模块、node:test + pytest、现有 `game.js` / `yardScene` / `editorScene`。

## Global Constraints

- 不宣称工程级仿真；首版目标是可信可玩。
- 模拟快照不得覆盖装配草稿；进试验场用已保存蓝图版本。
- 坡道视觉与碰撞必须匹配；渲染缩放不得偷偷改物理尺寸。
- 不以扩大地图替代核心验收：组装四轮臂 → 上坡 → 夹方块 → 倒车放回。
- 本轮不接 Rapier。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `simulation/terrain.mjs` | 坡道高度、地面 Y、坡面 tipFactor |
| `simulation/world.mjs` | 暴露 ramp 几何供 terrain；去掉占位说明 |
| `simulation/drive.mjs` | 惯性、负载减速、实际速度与轮角速度 |
| `simulation/grasp.mjs` | 抓取阶段（接近/闭合接触）辅助 API |
| `workshop/materials.mjs` | 金属/塑料/橡胶材质预设 |
| `workshop/sfx.mjs` | 电机/滚动/碰撞/安装/限位/抓取音 + 静音 |
| `workshop/editorScene.mjs` | 选中聚焦、标准视角、整机取景、缩放 |
| `workshop/yardScene.mjs` | 跟随镜头、高度场、轮转、阴影、SFX、负载 |
| `game.html` / `game.css` / `game.js` | 相机控件、音量、作品/试跑身份、文案 |
| `tests/test_game_immersive_*.mjs` | 地形/驱动/材质/镜头回归 |

---

### Task 1: 坡道高度场与 tipFactor

**Files:**
- Create: `src/desktop_robot/studio/static/game/simulation/terrain.mjs`
- Modify: `src/desktop_robot/studio/static/game/simulation/world.mjs`
- Test: `tests/test_game_immersive_terrain.mjs`

**Produces:**
- `heightAt(world, x, z) -> number`
- `tipFactorAt(world, x, z) -> number`（坡面 < 1）
- `sampleGroundY(world, x, z) -> number`

- [ ] **Step 1: Write failing test** — 坡顶高度 ≈ ramp.maxY；坡外为 0；坡面 tipFactor < 1
- [ ] **Step 2: Implement terrain + wire world.ramp**
- [ ] **Step 3: Tests pass**

---

### Task 2: 驾驶惯性、负载与轮速

**Files:**
- Modify: `simulation/drive.mjs`
- Test: `tests/test_game_immersive_drive.mjs`

**Produces:**
- `stepDrive` 维护 `vx/vz/omega` 或 `forwardSpeed`；`heldMass`/`baseMass` 降低加速度与顶速
- 返回或写入 `wheelOmega`（rad/s，与线速度/轮半径对应）

- [ ] **Step 1–3:** 测试惯性与负载减速 → 实现 → 绿

---

### Task 3: 抓取接触过程 API

**Files:**
- Modify: `simulation/grasp.mjs`
- Test: `tests/test_game_immersive_grasp.mjs`

**Produces:**
- `graspPhase(sim, tool, block) -> 'too_far'|'misaligned'|'open'|'ready'|'holding'`
- 现有 `tryGrasp` 语义不变，失败 reason 更清晰

---

### Task 4: 材质与音效模块

**Files:**
- Create: `workshop/materials.mjs`, `workshop/sfx.mjs`
- Test: `tests/test_game_immersive_materials.mjs`

**Produces:**
- `materialForPart(partId) -> {color, roughness, metalness}`
- `createSfx({muted})` → `play(event)`，`setMuted`，重复碰撞 throttle

---

### Task 5: 编辑器镜头与布局

**Files:**
- Modify: `editorScene.mjs`, `game.html`, `game.css`, `game.js`
- Test: `tests/test_game_immersive_editor_camera.mjs`（导出纯函数测标准视角目标）

**Produces:**
- `focusSelection` / `frameAll` / `setStandardView('front'|'side'|'top')`
- 滚轮缩放；可选减少镜头运动
- 窄窗零件库默认折叠倾向；局部工具条不挡连接点

---

### Task 6: 试验场沉浸同步

**Files:**
- Modify: `yardScene.mjs`, `game.html`, `game.js`, `game.css`
- Test: 复用 terrain/drive；`tests/test_game_immersive_yard.mjs` 抽纯逻辑

**Produces:**
- 第三人称跟随（look 跟车体，orbit 缓动）；工具聚焦模式
- `robotRoot.y = heightAt * SCALE`；倾覆用 `tipFactorAt`
- 轮子 mesh 按 `wheelOmega` 旋转；夹持载重写入 drive
- shadow map；材质分档；SFX 事件接线
- 去掉「坡道仅为视觉占位」文案；显示试跑作品名/零件数/版本
- 尺度道具：书本/螺丝视觉（不参与复杂物理）

---

### Task 7: P0 保存竞态与未保存离开 + 验收自测

**Files:**
- Modify: `game.js`, `buildDraft.mjs`
- Test: `tests/test_game_build_reliability.mjs` 扩展
- Run: node tests + pytest 相关子集

**Produces:**
- 保存成功若 `buildDirty` 仍为 true（保存期间又改了）则 **不** force sync
- 离开 build 且 dirty 时 confirm
- 自测清单对照 spec §9

---

## Spec Coverage

| Spec 条目 | Task |
| --- | --- |
| P0 作品可靠 | 7（既有 1–3 已部分落地）✅ |
| P1 看清空间 | 5–6 ✅ |
| P1 运动可信 | 1–3, 6 ✅ |
| P2 表现统一 | 4, 6 ✅ |
| 最小验证场景 | 6 + 自测 ✅ |
| 验收清单 §9 | Task 7 自测 ✅ |

## 自测记录（2026-09-24）

- `node --test tests/test_game_*.mjs`：69 passed
- `pytest tests/test_game.py tests/test_game_templates.py tests/test_game_challenge.py`：33 passed
- 冒烟：坡顶高度 0.18、坡面 tipFactor≈0.82、四轮模板含 gripper、保存竞态拒绝覆盖草稿

浏览器手工路径（建议本地再点一遍）：自由装配 → 教学模板 → 保存 → 试验场 → 上坡 → F 闭合 → Space 抓取 → 回放。

## 全量补齐记录（2026-09-28）

- 装配：半透明预览、碰撞拒绝、二次点击确认安装
- 试验场：零件机械外观、抓取序列、墙体裁剪相机、调试 HUD、低画质分档
- 结构对比：短臂够不到 / 长臂可及且载重易前倾（由 metrics 生成文案）
- 验收：spec §9 勾选；`scripts/playtest_immersive.mjs` 浏览器闭环
