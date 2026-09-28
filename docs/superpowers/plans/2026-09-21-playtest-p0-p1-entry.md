# 试玩优化 · P0 寻路布局与 P1 新手入口

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按试玩报告交付顺序第 1–2 步，修好自动寻路与窄窗任务面板重叠，并修正「开始试运行」文案与首关推荐装配引导。

**Architecture:** 将格子寻路与路径行走控制器从 `game.js` 抽出可测模块；修正 `busy` 期间二次点击静默丢弃的行为；用 CSS 变量为顶栏预留空间并支持收起任务面板。推荐装配仅改 `equipped`（可卸屏幕），先弹窗确认，不自动购买。

**Tech Stack:** 原生 JS/CSS、现有 Three.js 场景、`node:test`（与 `test_game_motion.mjs` 同风格）、pytest 仅在需要服务端契约时。

## Global Constraints

- 依据：`docs/superpowers/specs/2026-09-21-playtest-optimization.md` §3 P0、§4 P1-01/P1-02、§5 交付顺序 1–2。
- **本计划不含** P1-03 自由装配编辑器、P1-04 结构因果表现、P1-05 抽屉多解挑战（属自由装配改造后续计划）。
- 不破坏现有暂停/恢复、功耗校验、交付奖励与 `revision` 存档契约。
- 不引入新前端 npm 依赖。
- 寻路仍为 9×9 四邻格 BFS；不在本轮改连续坐标驾驶。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/desktop_robot/studio/static/game/pathfinding.mjs` | 纯函数：`findPath(start, goal, blocked, size)` |
| `src/desktop_robot/studio/static/game/game.js` | `walk` 控制器、推荐装配、入口文案绑定 |
| `src/desktop_robot/studio/static/game/game.css` | 顶栏空隙、可收起 `.play-quest` |
| `src/desktop_robot/studio/static/game.html` | 收起按钮、「前往委托板」、推荐装配按钮 |
| `tests/test_game_pathfinding.mjs` | BFS 与取消语义单测 |
| `tests/test_game.py` | 可选：HTML 文案/推荐装配 API 行为（若加服务端动作则测；本计划推荐装配可纯前端） |

---

### Task 1: 抽出可测寻路并修 walk 控制器

**Files:**
- Create: `src/desktop_robot/studio/static/game/pathfinding.mjs`
- Create: `tests/test_game_pathfinding.mjs`
- Modify: `src/desktop_robot/studio/static/game/game.js`
- Modify: `src/desktop_robot/studio/static/game/scene.js`（仅当需暴露「移动命令已受理」信号时）

**Interfaces:**
- Consumes: `state.active.position`、`state.world`、`act('move')`、`scene.waitForMotion` / `setRoute`
- Produces:
  - `findPath(start, goal, blockedCells, size=9) -> number[][] | null` — 不含 start，含 goal；不可达返回 `null`
  - `walk` 行为：路径中每步 `await act` + `await waitForMotion`；新点击用 `routeVersion` **取消**旧路径并启动新路径；方向键将 `routeVersion++` 取消自动寻路；离开 `play` 取消

**根因假设（实施时验证）：** 当前 `walk` 在 `busy===true` 时直接 `return`，二次点击既不取消也不排队；且若某次 `act`/`waitForMotion` 异常返回，循环 `break` 后无提示，表现为「只走一格停下」。修复后即使 `busy`，新目标也必须能取消并改道。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_game_pathfinding.mjs`：

```javascript
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findPath} from '../src/desktop_robot/studio/static/game/pathfinding.mjs';

test('finds open path excluding start', () => {
  const path = findPath([1, 1], [3, 1], new Set(), 9);
  assert.deepEqual(path, [[2, 1], [3, 1]]);
});

test('routes around blocked cells', () => {
  const blocked = new Set(['2,1']);
  const path = findPath([1, 1], [3, 1], blocked, 9);
  assert.ok(path);
  assert.ok(path.every(p => `${p[0]},${p[1]}` !== '2,1'));
  assert.deepEqual(path.at(-1), [3, 1]);
});

test('returns null when unreachable', () => {
  const blocked = new Set(['1,2', '2,1', '0,1', '1,0']);
  assert.equal(findPath([1, 1], [3, 3], blocked, 9), null);
});
```

另写一个轻量控制器测试（同文件或 `walkController` 导出）：用假 `act` 记录调用；第一次 walk 目标 A，在 busy 中触发第二次 walk 目标 B，断言最终只走到 B 且 A 路径被取消（通过 version）。若直接测 `game.js` 困难，则导出：

```javascript
export async function followPath({path, version, getVersion, move, onCancel}) {
  for (let i = 0; i < path.length; i++) {
    if (version !== getVersion()) { onCancel?.(); return {ok: false, reason: 'cancelled'}; }
    const result = await move(path[i]);
    if (!result) return {ok: false, reason: 'move_failed'};
  }
  return {ok: true};
}
```

测试：version 中途变化时提前返回 `cancelled`；`move` 返回 false 时返回 `move_failed`。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/test_game_pathfinding.mjs`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 pathfinding + 改造 walk**

`pathfinding.mjs`：标准 BFS，四邻，`blocked` 为 `"x,y"` 字符串集合。

`game.js`：

```javascript
import {findPath, followPath} from './pathfinding.mjs';

function blockedSet() {
  return new Set([
    ...state.world.blocked,
    ...(state.equipped.includes('tracks') ? [] : state.world.low),
  ].map(p => p.join(',')));
}

async function walk(target) {
  if (view !== 'play' || !state.active || navigating) return;
  const path = findPath(state.active.position, target, blockedSet(), state.world.size);
  if (!path) { toast('这里被挡住了，换个位置试试。'); return; }
  const version = ++routeVersion;
  scene?.setRoute(path);
  const result = await followPath({
    path,
    version,
    getVersion: () => routeVersion,
    move: async (pos) => {
      // 允许在 busy 时由新 walk 抬高 routeVersion；本步仍跑完当前 act
      const data = await act('move', {position: pos}, true);
      if (!data) return false;
      scene?.setRoute(path.slice(path.indexOf(pos) + 1)); // 或传入 index
      return true;
    },
  });
  if (version === routeVersion) scene?.setRoute([]);
  if (!result.ok && result.reason === 'move_failed') {
    toast('这一步没能走出去，请再点一次目标或换条路。');
  }
}
```

要点：

1. **删除** `walk` 开头对 `busy` 的拒绝；新点击通过 `++routeVersion` 取消旧 `followPath`。
2. 方向键保持 `routeVersion++` 取消自动寻路。
3. `navigate` 已有 `routeVersion++`，保持。
4. 确保每步在 `act('move')` 后仍 `await scene.waitForMotion()`（可放在 `move` 包装内，因 `act` 已 await motion——保持现状即可）。
5. 用 `path` 的 index 更新剩余路线，避免 `indexOf` 对坐标数组无效（应用循环下标 `i`）。

若验证发现 `waitForMotion` 在 `update` 时 `moving` 仍为 false：在 `scene.js` 的 `update` play 分支，当 `robotTarget` 相对当前位置变化时强制 `this.moving = true`（进入 play 的 snap 除外）。

- [ ] **Step 4: 运行测试通过**

Run: `node --test tests/test_game_pathfinding.mjs`

Expected: PASS

手动核对清单（写入报告即可）：空旷去程、绕障、中途改点、方向键打断、不可达 toast。

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/studio/static/game/pathfinding.mjs \
  src/desktop_robot/studio/static/game/game.js \
  src/desktop_robot/studio/static/game/scene.js \
  tests/test_game_pathfinding.mjs
git commit -m "$(cat <<'EOF'
fix(game): 修复自动寻路中断并抽出可测路径模块

EOF
)"
```

---

### Task 2: 窄窗任务面板与顶栏分层

**Files:**
- Modify: `src/desktop_robot/studio/static/game/game.css`
- Modify: `src/desktop_robot/studio/static/game.html`
- Modify: `src/desktop_robot/studio/static/game/game.js`（收起状态）

**Interfaces:**
- Consumes: 现有 `.topbar`、`.play-quest`
- Produces: `--topbar-height`；`body[data-view=play] .play-quest` 顶边在顶栏之下；收起后仅显示「任务」芯片，不挡场景点击（`pointer-events`）

- [ ] **Step 1: 写可自动化的布局契约测试**

在 `tests/test_game.py` 追加（HTTP 读静态页即可）：

```python
def test_play_quest_css_reserves_topbar_space():
    css = (Path('src/desktop_robot/studio/static/game/game.css')).read_text()
    assert '--topbar-height' in css
    assert 'play-quest' in css
    # 收起态类名约定
    assert 'play-quest-collapsed' in css or 'quest-collapsed' in css
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert 'id="toggle-quest"' in html or 'data-toggle-quest' in html
```

- [ ] **Step 2: 运行确认失败**

Run: `pytest tests/test_game.py::test_play_quest_css_reserves_topbar_space -v`

Expected: FAIL

- [ ] **Step 3: 实现布局**

`:root { --topbar-height: 92px; }`（与现有 topbar 实际高度对齐；`max-height:780` / `max-width:900` 媒体查询内同步覆盖）。

```css
body[data-view="play"] .play-quest {
  top: calc(var(--topbar-height) + 8px);
  max-height: min(42vh, calc(100dvh - var(--topbar-height) - 140px));
  overflow: auto;
  z-index: 5;
}
.topbar { z-index: 20; }
.play-quest.is-collapsed {
  width: auto;
  max-height: none;
  padding: 10px 14px;
}
.play-quest.is-collapsed #quest-body { display: none; }
```

HTML：在 `.play-quest` 内包一层 `#quest-body`（标题、目标、提示、按钮）；顶栏旁或面板角加 `<button type="button" id="toggle-quest" aria-expanded="true">收起</button>`。

JS：切换 `is-collapsed` 与 `aria-expanded`；收起时按钮文案「任务」。

同时检查 `.action-bar` 与 `.bottom-nav` 在 play 视图不重叠（已有 `bottom:112px`，窄屏再确认 `play-help`）。

- [ ] **Step 4: 测试通过**

Run: `pytest tests/test_game.py::test_play_quest_css_reserves_topbar_space -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/studio/static/game/game.css \
  src/desktop_robot/studio/static/game.html \
  src/desktop_robot/studio/static/game/game.js \
  tests/test_game.py
git commit -m "$(cat <<'EOF'
fix(game): 任务面板避开顶栏并支持收起

EOF
)"
```

---

### Task 3: 入口文案「前往委托板」

**Files:**
- Modify: `src/desktop_robot/studio/static/game.html`
- Modify: `tests/test_game.py`

- [ ] **Step 1: 写失败测试**

```python
def test_assembly_cta_says_go_to_missions():
    html = Path('src/desktop_robot/studio/static/game.html').read_text()
    assert '前往委托板' in html
    assert '开始试运行' not in html  # 装配页主 CTA；若帮助文案仍有「试运行」需改断言为装配按钮上下文
```

若帮助/其他处仍保留「试运行」字样，改为：

```python
assert 'data-view="missions"' in html
assert re.search(r'data-view="missions"[^>]*>\s*前往委托板', html)
```

- [ ] **Step 2–4: 改文案、跑通、提交**

装配侧栏主按钮：`开始试运行` → `前往委托板`（仍 `data-view="missions"`）。伙伴页「一起训练」可保留或改为「前往委托板」——本任务只强制改装配页主 CTA。

```bash
git commit -m "$(cat <<'EOF'
fix(game): 装配入口改为前往委托板

EOF
)"
```

---

### Task 4: 首关推荐装配（一键应用，先确认）

**Files:**
- Modify: `src/desktop_robot/studio/static/game/game.js`
- Modify: `src/desktop_robot/studio/static/game.html`
- Modify: `tests/test_game.py`（静态存在性）或前端逻辑用 node 测推荐差分

**Interfaces:**
- Consumes: `state.owned` / `state.equipped` / `act('equip')`
- Produces: `recommendedLoadoutFor(missionId) -> {equip: string[], unequip: string[], note: string}`
  - 首关 `first-light`：需要 `camera` + (`arm`|`arm_left`) + 底盘；若功耗超限则列入卸下 `display`
  - **不**自动 `buy`；若缺少 owned 零件，弹窗说明需先解锁，列出缺口

- [ ] **Step 1: 写失败测试**

新建 `tests/test_game_loadout.mjs`：

```javascript
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planStarterLoadout} from '../src/desktop_robot/studio/static/game/loadout.mjs';

test('unequips display when camera and arm would exceed 12W', () => {
  const plan = planStarterLoadout({
    owned: ['wheels', 'display', 'camera', 'arm'],
    equipped: ['wheels', 'display'],
    capacity: 12,
    basePower: 2,
    partPower: {wheels: 2, display: 2, camera: 3, arm: 5},
  });
  assert.deepEqual(plan.unequip, ['display']);
  assert.ok(plan.equip.includes('camera'));
  assert.ok(plan.equip.includes('arm'));
});
```

- [ ] **Step 2: 实现 `loadout.mjs` + UI**

装配页增加按钮「应用推荐装配（首关）」→ modal 列出将安装/卸下的零件与最终功耗 → 确认后依次 `act('equip')`（toggle 语义：仅对需要改变的 part 调用）。

不透明购买：缺口零件只提示「请先解锁××」，不扣币。

- [ ] **Step 3: 测试与提交**

```bash
node --test tests/test_game_loadout.mjs
git add ... 
git commit -m "$(cat <<'EOF'
feat(game): 首关推荐装配确认后一键应用

EOF
)"
```

---

## Spec Coverage

| 试玩条目 | 任务 |
| --- | --- |
| P0-01 寻路 | Task 1 |
| P0-02 窄窗重叠 | Task 2 |
| P1-01 入口语义 | Task 3 |
| P1-02 推荐装配 | Task 4 |
| P1-03～05 / 交付 3–5 | **排除**（后续计划） |

## Placeholder Scan

无 TBD；`followPath` 的 route 切片必须用下标而非 `indexOf`。

## Type Consistency

- `findPath` / `followPath` / `planStarterLoadout` 命名固定。
- 取消原因：`cancelled` | `move_failed`。

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-21-playtest-p0-p1-entry.md`.**

用户已表示「继续执行」且此前选择 Subagent-Driven，将直接按该方式执行本计划。
