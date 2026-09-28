# 三维机架改造 · 阶段一：现有体验回归修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `2026-09-22-3d-chassis-optimization.md` §6 阶段一，彻底修掉第二轮仍复现的「点击远处只走一格」与窄窗任务/品牌重叠，并补齐推荐装配四种状态验证。

**Architecture:** 将「发出移动命令后必定等待动画结束」从「用距离猜测 moving」改为显式 motion token；修正 `@media(max-width:900px)` 覆盖掉顶栏偏移的 CSS；用 node 单测锁住 walk 多步与 loadout 四态。阶段二～四（机架编辑 / Rapier / 多解挑战）另开计划，本计划不实施。

**Tech Stack:** 现有 Three.js、`pathfinding.mjs`、`loadout.mjs`、node:test、pytest 静态契约。

## Global Constraints

- 依据：`docs/superpowers/specs/2026-09-22-3d-chassis-optimization.md` §2–3、§6 阶段一、§3 P0/P1 推荐装配。
- 第二轮证据：564×762 仍重叠；点击远处「步数 +1 后停，再点再 +1」——说明路径多步未跑完或每步被取消，不能只靠「模块已存在」结案。
- 不引入 Rapier / 新 npm 依赖；不改网格规则为连续驾驶。
- 保留暂停恢复、revision、旧任务与存档。
- 阶段二～四不在本计划范围。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `scene.js` | 显式 `armMotion()` / `waitForMotion` token，避免距离误判导致不等待或空等待 |
| `game.js` | walk 多步联调、可选 step 日志开关 |
| `game.css` | 窄屏 play-quest 仍相对顶栏偏移；滚动后仍可用 |
| `loadout.mjs` + 测试 | 四种推荐装配状态 |
| `tests/test_game_walk_integration.mjs` | 假 act + 假 scene 验证多步走完 |

---

### Task 1: 显式运动等待，修复「只走一格」

**Files:**
- Modify: `src/desktop_robot/studio/static/game/scene.js`
- Modify: `src/desktop_robot/studio/static/game/game.js`
- Create: `tests/test_game_walk_integration.mjs`
- Modify: `tests/test_game_pathfinding.mjs`（如需）

**根因（实施时验证并在报告写明）：**

`waitForMotion()` 依赖 `update()` 里 `moving = distance > 0.001`。若在 `update` 与 `waitForMotion` 之间、或二次 `update`（如 `resize`）把 `moving` 置 false / 未登记 waiter，则等待立刻结束；下一步 `act` 可能在动画未完成或忙碌竞态下失败/`return false`，表现为每点一次只进一步。

**修复契约：**

- `WorkshopScene.armMotion()`：登记一次「期望到达当前 `robotTarget`」的 Promise，并强制 `this.moving = true`。
- `finishMotion()`：仍在 `pose.arrived` 或 visibility snap 时解析全部 waiter。
- `waitForMotion()`：若已有 pending arm，返回该 Promise；否则若 `moving` 则挂 waiter；若目标已到达则立即 resolve。
- `act('move')`：在 `scene.update` 之后调用 `await scene.armMotion()`（或等价），**不要**仅依赖距离猜测。
- 若目标与当前位置距离 &lt; 0.001（无位移），`armMotion` 立即 resolve。

**Interfaces:**

```javascript
// scene.js
armMotion(): Promise<void>  // call after robotTarget updated for a move
waitForMotion(): Promise<void>  // keep for compatibility; prefer armMotion from act
```

- [ ] **Step 1: 写失败集成测试**

`tests/test_game_walk_integration.mjs`：

```javascript
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPath, followPath} from '../src/desktop_robot/studio/static/game/pathfinding.mjs';

test('followPath walks every cell when move always succeeds', async () => {
  const path = findPath([1, 1], [4, 1], new Set(), 9);
  assert.equal(path.length, 3);
  const seen = [];
  let version = 1;
  const result = await followPath({
    path,
    version,
    getVersion: () => version,
    move: async (pos) => { seen.push(pos.join(',')); return true; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ['2,1', '3,1', '4,1']);
});

test('scene armMotion resolves only after finishMotion', async () => {
  // 动态 import scene 过重；改为导出微模块 motionGate.mjs 测 token 语义
});
```

优先把 token 抽成 `motionGate.mjs`（纯 JS，无 Three 依赖）以便测试：

```javascript
export function createMotionGate() {
  let waiters = [];
  let moving = false;
  return {
    get moving() { return moving; },
    armMotion(alreadyThere) {
      if (alreadyThere) { moving = false; return Promise.resolve(); }
      moving = true;
      return new Promise((r) => waiters.push(r));
    },
    finishMotion() {
      moving = false;
      for (const r of waiters.splice(0)) r();
    },
  };
}
```

`scene.js` 内部使用同一语义。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/test_game_walk_integration.mjs`

Expected: FAIL（缺模块或 armMotion 未接）

- [ ] **Step 3: 实现并接线**

1. 新增 `motionGate.mjs`（或内联等效逻辑于 scene）。
2. `act` 中 move 分支：`scene.update` 后 `await scene.armMotion()`。
3. `frame` 到达时 `finishMotion`。
4. walk 保持 `followPath`；确保每步 await 完整 act（含 armMotion）。
5. 可选：`localStorage.DEBUG_WALK=1` 时 `console.debug` 记录 `{step, from, to, reason}`。

- [ ] **Step 4: 测试通过**

Run: `node --test tests/test_game_pathfinding.mjs tests/test_game_walk_integration.mjs tests/test_game_motion.mjs`

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(game): 用显式运动令牌修复寻路只走一格

EOF
)"
```

---

### Task 2: 窄窗任务面板不再被媒体查询打回重叠

**Files:**
- Modify: `src/desktop_robot/studio/static/game/game.css`
- Modify: `tests/test_game.py`

**根因：** `@media(max-width:900px)` 中 `body[data-view="play"] .play-quest{top:auto}` **覆盖**了桌面规则 `top: calc(var(--topbar-height) + 8px)`。第二轮截图 564×762 命中该媒体查询，故仍与品牌重叠。

- [ ] **Step 1: 写失败测试**

```python
def test_narrow_play_quest_keeps_topbar_offset():
    css = Path('src/desktop_robot/studio/static/game/game.css').read_text()
    # 在 max-width:900px 块内，play 视图不得用 top:auto 取消顶栏避让
    narrow = css.split('@media(max-width:900px)')[1]
    assert 'body[data-view="play"] .play-quest' in narrow or 'data-view="play"] .play-quest' in narrow
    # 允许 top:calc(var(--topbar-height) 或 padding-top；禁止仅 top:auto 且无替代避让
    play_rules = [s for s in narrow.split('}') if 'play-quest' in s and 'data-view="play"' in s]
    assert play_rules, 'missing play-quest override in narrow media'
    joined = '}'.join(play_rules)
    assert 'top:auto' not in joined or 'topbar-height' in joined
    assert 'topbar-height' in joined or 'padding-top' in joined
```

- [ ] **Step 2–4: 改 CSS**

在 `@media(max-width:900px)` 内改为：

```css
body[data-view="play"] .play-quest {
  position: relative;
  top: 0;
  margin-top: 0;
  max-height: none;
  overflow: visible;
}
body[data-view="play"] main {
  padding-top: 0;
  margin-top: calc(var(--topbar-height) + 12px); /* 若 main 已有 margin 则叠加检查 */
}
```

或保持 absolute：

```css
body[data-view="play"] .play-quest {
  position: absolute;
  top: calc(var(--topbar-height) + 8px);
  left: 12px;
  ...
}
```

并确认 `main`/`.screen#play` 在窄屏 `position:relative` 时，绝对定位相对的是 screen 而非 viewport——若 relative 导致「顶栏下仍重叠」，给 `#play` 增加 `padding-top: 8px` 且保证 screen 从顶栏下开始（检查 `main` 的 `margin: 90px 20px` 是否足够；564 宽时 topbar 80px，`margin-top:90px` 应够，但 play-quest `top:auto` 在 flow 里可能画在 screen 顶部仍与 fixed topbar 视觉重叠，若 screen 的 margin 不够吃到 topbar）。

**验收逻辑：** fixed topbar 与 play-quest 的文档盒在垂直方向不相交（用 CSS 保证 quest 起点 ≥ topbar 底边）。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(game): 窄屏任务面板保留顶栏避让

EOF
)"
```

---

### Task 3: 推荐装配四种状态测试

**Files:**
- Modify: `tests/test_game_loadout.mjs`
- Modify: `src/desktop_robot/studio/static/game/loadout.mjs`（仅当缺态行为不符）

**四态：**

| 状态 | 输入要点 | 期望 |
| --- | --- | --- |
| 缺零件 | owned 无 camera | `missing` 含 camera，不给出可执行 equip |
| 功耗不足且无法改底盘 | 无 wheels、仅 tracks、无 battery | `ok===false` 或 missing，确认禁用 |
| 需要卸装 | equipped display+wheels | unequip display，equip camera+arm |
| 已满足 | 已是推荐集 | equip/unequip 皆空，note 说明已就绪，UI 可提示无需改动 |

- [ ] **Step 1–4: 补测并修 planStarterLoadout「已满足」**

若当前对已满足仍列出冗余 toggle，改为空操作 + `note: '当前装配已满足首关推荐。'`。

UI：`plan.equip.length===0 && plan.unequip.length===0 && !plan.missing.length` 时 modal 只显示「已满足」主按钮关闭，不调用 act。

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(game): 覆盖推荐装配四种状态

EOF
)"
```

---

## Spec Coverage

| 文档条目 | 任务 |
| --- | --- |
| §6 阶段一 · 寻路回归 | Task 1 |
| §6 阶段一 · 窄窗布局 | Task 2 |
| §6 阶段一 · 推荐装配四态 | Task 3 |
| §6 阶段二～四 | **排除** |

## Placeholder Scan

无 TBD；集成测试不得以「模块存在」代替多步走完断言。

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-22-3d-chassis-phase-1.md`.**

按「按照选中的执行」与既往 Subagent-Driven 偏好，开始执行本计划。
