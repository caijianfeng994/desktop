# 自由装配工坊 · 阶段 A 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将「装备 ID 列表」升级为可多实例、带位姿与连接关系的版本化蓝图，并完成旧存档迁移与一个可证明「结构差异影响行为」的纯数据原型。

**Architecture:** 在 `desktop_robot.game` 下新增 `parts.py`（定义）与 `blueprints.py`（实例、连接、校验、迁移、结构度量）。`engine.py` 的存档 schema 升至 version 3：持久化 `blueprints` + `active_blueprint_id`，同时派生只读 `equipped` 以保持现有任务/功耗/前端契约不中断。首轮不做三维编辑器与物理引擎，先用连接图上的臂长/轮距/抓取半径证明结构因果。

**Tech Stack:** Python 3.11+、Pydantic v2、SQLite（现有 `GameStore`）、pytest。不新增前端依赖；本阶段不改 `scene.js` 装配交互。

## Global Constraints

- 规格依据：`docs/superpowers/specs/2026-09-21-freeform-robot-workshop-redesign.md` 第 9、10、11、13 节；本计划只覆盖阶段 A + 结构度量原型。
- 游戏坐标系：Y 向上，机器人局部 +Z 为前；蓝图局部变换保存相对父连接；单位米 / 千克 / 秒。
- 首版连接图为以核心为根的树，禁止环。
- 迁移幂等：不重复赠送、扣除或生成零件实例。
- 保留现有 `equipped` 读写语义给未改动的任务与 UI；新数据以蓝图为准，`equipped` 由蓝图派生。
- 游戏试验不向真机发送指令；游戏蓝图不标记为可制造。
- 不扩大 `engine.py` 职责：零件定义与蓝图逻辑进独立模块。

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/desktop_robot/game/parts.py` | `PartDefinition`、首批零件目录、按 ID 查询 |
| `src/desktop_robot/game/blueprints.py` | `Pose`、`PartInstance`、`Connection`、`Blueprint`、校验、经典小方模板、迁移、结构度量 |
| `src/desktop_robot/game/engine.py` | schema v3、`GameStore` 迁移挂钩、`equip`/`buy` 同步蓝图、`snapshot` 暴露蓝图摘要 |
| `tests/test_game_blueprints.py` | 蓝图校验、多实例、度量、迁移幂等 |
| `tests/test_game.py` | 扩展既有迁移与装备回归，确认 v2→v3 与旧测试仍通过 |

---

### Task 1: 零件定义目录

**Files:**
- Create: `src/desktop_robot/game/parts.py`
- Test: `tests/test_game_blueprints.py`

**Interfaces:**
- Consumes: 无
- Produces:
  - `Pose(x: float, y: float, z: float, rx: float, ry: float, rz: float)` — 欧拉角弧度，相对父连接
  - `ConnectionPoint(id: str, pose: Pose, kinds: frozenset[str])`
  - `PartDefinition(id, name, category, mass_kg, power_w, ports, connection_points, behaviors: frozenset[str], size_m: tuple[float,float,float], owned_by_default: bool, price: int, description: str, icon: str, ability: str)`
  - `PART_DEFINITIONS: dict[str, PartDefinition]`
  - `get_part(part_id: str) -> PartDefinition`（未知 ID 抛 `KeyError`）

- [ ] **Step 1: 写失败测试**

创建 `tests/test_game_blueprints.py`：

```python
from desktop_robot.game.parts import PART_DEFINITIONS, get_part


def test_catalog_has_core_and_combinable_parts():
    required = {
        "core", "plate", "beam", "post", "wheel", "drive_wheel", "track_module",
        "revolute_joint", "prism_joint", "gripper", "pusher", "hook", "bucket",
        "battery", "camera", "display",
    }
    assert required <= set(PART_DEFINITIONS)
    core = get_part("core")
    assert "root" in {p.id for p in core.connection_points}
    assert core.mass_kg > 0
    wheel = get_part("wheel")
    assert "axle" in wheel.connection_points[0].kinds or any("axle" in p.kinds for p in wheel.connection_points)
    legacy = {"camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"}
    assert legacy <= set(PART_DEFINITIONS)  # 迁移别名仍可解析为定义
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game_blueprints.py::test_catalog_has_core_and_combinable_parts -v`

Expected: FAIL，模块不存在或 `PART_DEFINITIONS` 缺失。

- [ ] **Step 3: 实现零件目录**

创建 `src/desktop_robot/game/parts.py`，用 Pydantic 模型实现上述接口。首批定义要点：

- `core`：唯一根；连接点 `mount_top`、`mount_front`、`mount_back`、`mount_left`、`mount_right`、`mount_bottom`；`kinds` 含 `structure`。
- `plate` / `beam` / `post`：结构件；多面 `structure` 连接点；尺寸分别约 `(0.12,0.02,0.12)` / `(0.02,0.02,0.12)` / `(0.03,0.12,0.03)`。
- `wheel` / `drive_wheel` / `track_module`：`axle` 连接；`behaviors` 含 `roll` 或 `track`。
- `revolute_joint` / `prism_joint`：两端 `joint`；`behaviors` 含 `pivot` / `extend`。
- `gripper` / `pusher` / `hook` / `bucket`：工具端；`behaviors` 分别为 `grasp` / `push` / `drag` / `carry`。
- `battery` / `camera` / `display`：与现有功耗/能力对齐。
- 迁移别名（同一 `PartDefinition` 或薄包装 ID）：
  - `wheels` → 逻辑上对应可迁移为四轮模板，定义本身保留 `id="wheels"` 且 `behaviors={"roll"}`，供经典模板引用。
  - `tracks` → `track_module` 能力等价的整件底盘定义，保留 `id="tracks"`。
  - `arm` / `arm_left` → 保留为「经典整臂」定义（`behaviors={"grasp"}`），连接点 `base`；新自由臂用 `revolute_joint`+`beam`+`gripper` 组合。

每个定义至少 1 个连接点；`power_w` / `ports` / `price` / `owned_by_default` / `icon` / `ability` 与当前 `engine.PARTS` 对齐，便于 `engine` 逐步改为从目录读取。

- [ ] **Step 4: 运行测试确认通过**

Run: `pytest tests/test_game_blueprints.py::test_catalog_has_core_and_combinable_parts -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/parts.py tests/test_game_blueprints.py
git commit -m "$(cat <<'EOF'
feat(game): 新增自由装配零件定义目录

EOF
)"
```

---

### Task 2: 蓝图模型与连接图校验

**Files:**
- Create: `src/desktop_robot/game/blueprints.py`
- Modify: `tests/test_game_blueprints.py`

**Interfaces:**
- Consumes: `get_part`、`PartDefinition`
- Produces:
  - `PartInstance(instance_id: str, part_id: str, local_pose: Pose, params: dict[str, float] = {})`
  - `Connection(parent_instance_id: str, parent_point_id: str, child_instance_id: str, child_point_id: str, joint: str = "fixed")`
  - `Blueprint(id: str, name: str, root_instance_id: str, instances: list[PartInstance], connections: list[Connection], bindings: dict[str, list[str]] = {}, version: int = 1)`
  - `ValidationError` 条目：`code: str, message: str`
  - `validate_blueprint(bp: Blueprint) -> list[ValidationError]` — 空列表表示通过
  - 校验规则：实例 part_id 存在；连接点存在且 kinds 有交集；每个连接点至多占用一次；`root` 存在且从图可达全部实例；无环；禁止自连

- [ ] **Step 1: 写失败测试**

```python
from desktop_robot.game.blueprints import (
    Blueprint, Connection, PartInstance, Pose, validate_blueprint,
)
from desktop_robot.game.parts import get_part


def _inst(iid, pid, **pose):
    return PartInstance(instance_id=iid, part_id=pid, local_pose=Pose(**{**dict(x=0,y=0,z=0,rx=0,ry=0,rz=0), **pose}))


def test_validate_accepts_core_with_four_wheels():
    bp = Blueprint(
        id="quad",
        name="四轮",
        root_instance_id="core-1",
        instances=[
            _inst("core-1", "core"),
            _inst("w1", "wheel"), _inst("w2", "wheel"),
            _inst("w3", "wheel"), _inst("w4", "wheel"),
        ],
        connections=[
            Connection("core-1", "mount_bottom", "w1", "hub"),
            Connection("core-1", "mount_left", "w2", "hub"),
            Connection("core-1", "mount_right", "w3", "hub"),
            Connection("core-1", "mount_back", "w4", "hub"),
        ],
    )
    # 若 wheel 连接点 id 不是 hub，测试实现时按 parts.py 实际 id 调整
    assert validate_blueprint(bp) == []


def test_validate_rejects_cycle_and_missing_point():
    bp = Blueprint(
        id="bad",
        name="坏",
        root_instance_id="a",
        instances=[_inst("a", "plate"), _inst("b", "beam")],
        connections=[
            Connection("a", "face_a", "b", "end_a"),
            Connection("b", "end_b", "a", "face_b"),
        ],
    )
    codes = {e.code for e in validate_blueprint(bp)}
    assert "cycle" in codes or "disconnected" in codes or "point" in "".join(codes)
```

说明：Step 3 实现时，测试里的连接点 ID 必须与 Task 1 中 `parts.py` 实际命名一致；若命名不同，先改测试再实现，禁止假通过。

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game_blueprints.py::test_validate_accepts_core_with_four_wheels tests/test_game_blueprints.py::test_validate_rejects_cycle_and_missing_point -v`

Expected: FAIL，`blueprints` 模块不存在。

- [ ] **Step 3: 实现蓝图与校验**

在 `blueprints.py` 实现模型与 `validate_blueprint`。连接兼容：`parent_point.kinds & child_point.kinds` 非空。占用表：`(instance_id, point_id)` 唯一。连通性：从 `root_instance_id` BFS/DFS 覆盖全部 `instances`。环检测：在无向树语义下，每个非根实例入度恰好为 1；根入度为 0；出现第二入度或回边即 `cycle`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pytest tests/test_game_blueprints.py -k validate -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/blueprints.py tests/test_game_blueprints.py
git commit -m "$(cat <<'EOF'
feat(game): 蓝图实例连接模型与无环校验

EOF
)"
```

---

### Task 3: 经典小方模板与 equipped 派生

**Files:**
- Modify: `src/desktop_robot/game/blueprints.py`
- Modify: `tests/test_game_blueprints.py`

**Interfaces:**
- Consumes: `Blueprint`、`PART_DEFINITIONS`
- Produces:
  - `classic_xiaofang_blueprint(equipped: list[str], blueprint_id: str = "classic") -> Blueprint`
  - `derived_equipped(bp: Blueprint) -> list[str]` — 从实例 `part_id` 去重保序，映射回现有 UI 认识的 ID（`drive_wheel`/`wheel` 簇映射为有 `wheels` 或保留具体 id；经典 `arm`/`arm_left`/`wheels`/`tracks`/`camera`/`display`/`battery` 原样出现）
  - 规则：始终包含一个 `core` 根；对每个 `equipped` 中的旧零件 ID 生成对应实例并挂到预设连接点（与当前 `scene.js` 左右臂、摄像头、电池、底盘位姿语义一致的默认局部位姿）

- [ ] **Step 1: 写失败测试**

```python
from desktop_robot.game.blueprints import classic_xiaofang_blueprint, derived_equipped, validate_blueprint


def test_classic_template_from_equipped_roundtrip():
    equipped = ["wheels", "display", "camera", "arm", "arm_left"]
    bp = classic_xiaofang_blueprint(equipped)
    assert validate_blueprint(bp) == []
    assert bp.root_instance_id
    part_ids = [i.part_id for i in bp.instances]
    assert part_ids.count("core") == 1
    assert "arm" in part_ids and "arm_left" in part_ids
    assert set(derived_equipped(bp)) >= {"wheels", "display", "camera", "arm", "arm_left"}


def test_four_identical_wheels_are_distinct_instances():
    bp = classic_xiaofang_blueprint([])
    # 手动加四个 wheel 实例应保留四个 instance_id
    from desktop_robot.game.blueprints import Blueprint, Connection, PartInstance, Pose
    wheels = [
        PartInstance(f"w{i}", "wheel", Pose(0, 0, 0, 0, 0, 0)) for i in range(4)
    ]
    # 使用 validate 通过的最小手工蓝图（实现时补全连接）
    assert len({w.instance_id for w in wheels}) == 4
```

将第二个测试补全为：构建带 4 个 `wheel` 的合法蓝图，`len(bp.instances)` 中 wheel 数为 4，且 `validate_blueprint(bp)==[]`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game_blueprints.py::test_classic_template_from_equipped_roundtrip -v`

Expected: FAIL，函数未定义。

- [ ] **Step 3: 实现模板与派生**

`classic_xiaofang_blueprint`：固定 `core-1`；按 equipped 集合添加实例。默认连接映射示例：

| part_id | parent_point | child_point |
| --- | --- | --- |
| wheels / tracks | mount_bottom | mount |
| display | mount_front | mount |
| camera | mount_top | mount |
| arm | mount_right | base |
| arm_left | mount_left | base |
| battery | mount_back | mount |

`local_pose` 可用全零（吸附点已表达偏移）或与 scene 视觉大致对应的小偏移；本阶段不要求与 Three.js 网格对齐。

`derived_equipped`：遍历实例，跳过 `core`；输出去重列表，顺序稳定（按实例插入序）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pytest tests/test_game_blueprints.py -k "classic or four_identical" -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/blueprints.py tests/test_game_blueprints.py
git commit -m "$(cat <<'EOF'
feat(game): 经典小方蓝图模板与 equipped 派生

EOF
)"
```

---

### Task 4: 结构度量原型（臂长 / 轮距 / 抓取半径）

**Files:**
- Modify: `src/desktop_robot/game/blueprints.py`
- Modify: `tests/test_game_blueprints.py`

**Interfaces:**
- Consumes: 已校验的 `Blueprint`、`get_part`
- Produces:
  - `world_poses(bp: Blueprint) -> dict[str, Pose]` — 将局部位姿沿连接树合成世界位姿（父世界 ⊗ 父连接点 ⊗ 子连接点逆 ⊗ 子 local）
  - `structure_metrics(bp: Blueprint) -> dict[str, float]`，至少包含：
    - `wheelbase_m`：任意两个 `roll`/`track` 行为实例世界 XZ 投影的最大间距
    - `reach_m`：从 root 到任意 `grasp`/`drag`/`push` 工具原点的水平距离
    - `grasp_radius_m`：`reach_m + tool_half_extent`（工具 `size_m` 最长边的一半）
    - `mass_kg`：全实例质量之和
    - `com_x` / `com_z`：质量加权质心（忽略 Y 或一并给出 `com_y`）

- [ ] **Step 1: 写失败测试**

```python
from desktop_robot.game.blueprints import (
    Blueprint, Connection, PartInstance, Pose, structure_metrics, validate_blueprint,
)


def _pose(**kw):
    base = dict(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0)
    base.update(kw)
    return Pose(**base)


def test_longer_arm_increases_grasp_radius():
    short = Blueprint(
        id="short",
        name="短臂",
        root_instance_id="c",
        instances=[
            PartInstance("c", "core", _pose()),
            PartInstance("j", "revolute_joint", _pose()),
            PartInstance("g", "gripper", _pose()),
        ],
        connections=[
            Connection("c", "mount_front", "j", "in"),
            Connection("j", "out", "g", "mount"),
        ],
    )
    long = Blueprint(
        id="long",
        name="长臂",
        root_instance_id="c",
        instances=[
            PartInstance("c", "core", _pose()),
            PartInstance("j", "revolute_joint", _pose()),
            PartInstance("b", "beam", _pose(z=0.12)),
            PartInstance("g", "gripper", _pose()),
        ],
        connections=[
            Connection("c", "mount_front", "j", "in"),
            Connection("j", "out", "b", "end_a"),
            Connection("b", "end_b", "g", "mount"),
        ],
    )
    # 连接点 id 与 parts.py 对齐；必要时在实现前修正测试字符串
    assert validate_blueprint(short) == []
    assert validate_blueprint(long) == []
    assert structure_metrics(long)["grasp_radius_m"] > structure_metrics(short)["grasp_radius_m"]


def test_wider_wheelbase_is_larger():
    narrow = classic_xiaofang_blueprint(["wheels"])  # noqa: F821 — import in file
    # 构建宽轮距：左右轮 local_pose.x 分别为 ±0.15
    # 断言 structure_metrics(wide)["wheelbase_m"] > structure_metrics(narrow)["wheelbase_m"]
```

实现前把 `test_wider_wheelbase_is_larger` 写成完整可运行断言；`classic_xiaofang_blueprint` 从模块导入。

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game_blueprints.py::test_longer_arm_increases_grasp_radius -v`

Expected: FAIL，`structure_metrics` 未定义。

- [ ] **Step 3: 实现世界位姿合成与度量**

简化旋转：首版允许仅用平移累加（连接点 `pose` 的 x/y/z），旋转字段保留但度量测试只用平移差异；在文档字符串注明完整旋转将在阶段 C 接入。`wheelbase_m` 用 XZ 平面欧氏距离最大值。

- [ ] **Step 4: 运行测试确认通过**

Run: `pytest tests/test_game_blueprints.py -k "grasp_radius or wheelbase" -v`

Expected: PASS，且长臂半径与宽轮距严格更大。

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/blueprints.py tests/test_game_blueprints.py
git commit -m "$(cat <<'EOF'
feat(game): 蓝图结构度量证明臂长与轮距差异

EOF
)"
```

---

### Task 5: 存档 schema v3 迁移

**Files:**
- Modify: `src/desktop_robot/game/engine.py`
- Modify: `tests/test_game.py`
- Modify: `tests/test_game_blueprints.py`（可选迁移单测）

**Interfaces:**
- Consumes: `classic_xiaofang_blueprint`、`derived_equipped`、`Blueprint.model_dump`
- Produces:
  - `initial_state()["version"] == 3`
  - 字段：`blueprints: list[dict]`、`active_blueprint_id: str`
  - `migrate_state(state: dict) -> dict`：若 `version < 3`，在事务路径内：备份语义（revision+1）、用当前 `equipped` 生成经典蓝图写入 `blueprints`、设 `active_blueprint_id`、`version=3`；`version < 2` 仍先走现有左臂/facing 逻辑再升到 3
  - `GameStore.__init__` 调用迁移且可重复打开不重复添加实例
  - `snapshot` 增加 `blueprints`、`active_blueprint_id`、以及可选 `metrics`（对 active 蓝图调用 `structure_metrics`）

- [ ] **Step 1: 写失败测试**

在 `tests/test_game.py` 追加：

```python
def test_v2_save_migrates_to_blueprint_without_losing_progress(tmp_path):
    store = GameStore(tmp_path)
    prepare(store)
    state = finish(store, store.get()['missions'][0])
    with store.connect() as db:
        raw = json.loads(db.execute('SELECT state FROM game WHERE id=1').fetchone()[0])
        raw['version'] = 2
        raw.pop('blueprints', None)
        raw.pop('active_blueprint_id', None)
        db.execute('UPDATE game SET state=? WHERE id=1', (json.dumps(raw),))
    migrated = GameStore(tmp_path).get()
    assert migrated['version'] == 3
    assert migrated['active_blueprint_id']
    assert len(migrated['blueprints']) >= 1
    assert set(migrated['equipped']) == set(state['equipped'])
    assert migrated['coins'] == state['coins']
    assert migrated['completed'] == state['completed']
    again = GameStore(tmp_path).get()
    assert len(again['blueprints']) == len(migrated['blueprints'])
```

更新 `test_legacy_game_migration_preserves_progress_and_adds_left_arm_once`：最终 `version == 3`，并断言存在蓝图；其余进度字段断言保持。

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game.py::test_v2_save_migrates_to_blueprint_without_losing_progress -v`

Expected: FAIL，version 仍为 2 或缺少 blueprints。

- [ ] **Step 3: 实现迁移**

在 `engine.py`：

```python
def migrate_state(state: dict) -> dict:
    if state.get("version", 1) < 2:
        # 现有 v1→v2 逻辑原样移入
        ...
        state["version"] = 2
    if state.get("version", 1) < 3:
        from desktop_robot.game.blueprints import classic_xiaofang_blueprint
        bp = classic_xiaofang_blueprint(list(state.get("equipped", [])))
        state["blueprints"] = [bp.model_dump(mode="json")]
        state["active_blueprint_id"] = bp.id
        state["version"] = 3
    return state
```

`initial_state` 直接带 v3 空经典蓝图（`equipped=["wheels","display"]`）。`GameStore.__init__` 读取后 `migrate_state`，若有变更则写回并 `revision += 1`。

- [ ] **Step 4: 运行全部游戏测试**

Run: `pytest tests/test_game.py tests/test_game_blueprints.py -v`

Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/engine.py tests/test_game.py tests/test_game_blueprints.py
git commit -m "$(cat <<'EOF'
feat(game): 存档升至 v3 并迁移经典蓝图

EOF
)"
```

---

### Task 6: equip / buy 与蓝图同步

**Files:**
- Modify: `src/desktop_robot/game/engine.py`
- Modify: `tests/test_game.py`

**Interfaces:**
- Consumes: active `Blueprint`、`classic_xiaofang_blueprint` 或增量修改辅助函数
- Produces:
  - `apply_action` 的 `equip` / `buy`：在更新 `equipped` 成功后，重建或修补 active 蓝图，使 `derived_equipped(active) == state["equipped"]`（集合相等）
  - 辅助：`sync_blueprint_with_equipped(state: dict) -> None`（就地更新 `state["blueprints"]`）
  - 本阶段允许「整表重建经典模板」而非细粒度编辑；阶段 B 再改为实例级编辑 API

- [ ] **Step 1: 写失败测试**

```python
def test_equip_updates_active_blueprint_instances(tmp_path):
    store = GameStore(tmp_path)
    assert store.get()['version'] == 3
    before_ids = {i['part_id'] for b in store.get()['blueprints'] for i in b['instances']}
    action(store, 'equip', part='camera')
    state = store.get()
    part_ids = {i['part_id'] for b in state['blueprints'] if b['id'] == state['active_blueprint_id'] for i in b['instances']}
    assert 'camera' in part_ids
    assert 'camera' in state['equipped']
    action(store, 'equip', part='camera')  # toggle off
    state = store.get()
    part_ids = {i['part_id'] for b in state['blueprints'] if b['id'] == state['active_blueprint_id'] for i in b['instances']}
    assert 'camera' not in part_ids
    assert 'camera' not in state['equipped']
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pytest tests/test_game.py::test_equip_updates_active_blueprint_instances -v`

Expected: FAIL，装备后蓝图实例未变。

- [ ] **Step 3: 实现同步**

在 `equip` 成功写入 `state["equipped"]` 之后调用：

```python
def sync_blueprint_with_equipped(state: dict) -> None:
    from desktop_robot.game.blueprints import classic_xiaofang_blueprint
    bp = classic_xiaofang_blueprint(state["equipped"], blueprint_id=state.get("active_blueprint_id") or "classic")
    state["active_blueprint_id"] = bp.id
    others = [b for b in state.get("blueprints", []) if b.get("id") != bp.id]
    state["blueprints"] = others + [bp.model_dump(mode="json")]
```

功耗/接口校验仍基于 `equipped` 列表，行为与现网一致。

- [ ] **Step 4: 回归**

Run: `pytest tests/test_game.py tests/test_game_blueprints.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/engine.py tests/test_game.py
git commit -m "$(cat <<'EOF'
feat(game): 装备变更同步到 active 蓝图

EOF
)"
```

---

### Task 7: engine.PARTS 改为目录投影（兼容层）

**Files:**
- Modify: `src/desktop_robot/game/engine.py`
- Modify: `src/desktop_robot/game/parts.py`（若缺 UI 字段）

**Interfaces:**
- Consumes: `PART_DEFINITIONS`
- Produces: `PARTS` / `PART_BY_ID` 由定义投影为现有 dict 形状（`id,name,category,description,power,ports,price,ability,icon,owned`），保证 `snapshot()["parts"]` 与前端卡片字段不变；旧测试不改断言即可通过

- [ ] **Step 1: 写失败测试**

```python
def test_parts_snapshot_matches_definition_catalog(tmp_path):
    from desktop_robot.game.parts import PART_DEFINITIONS
    store = GameStore(tmp_path)
    ids = {p['id'] for p in store.get()['parts']}
    # 前端仍只需旧七件；完整目录可更大
    assert {"camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"} <= ids
    assert "core" in PART_DEFINITIONS
```

- [ ] **Step 2: 运行测试**

Run: `pytest tests/test_game.py::test_parts_snapshot_matches_definition_catalog -v`

若已因 Task 1 存在 `core` 但 `PARTS` 未投影，可能 FAIL 或仅缺断言——按失败信息实现投影。

- [ ] **Step 3: 投影实现**

```python
def _part_card(defn) -> dict:
    return dict(
        id=defn.id, name=defn.name, category=defn.category,
        description=defn.description, power=int(defn.power_w),
        ports=defn.ports, price=defn.price, ability=defn.ability,
        icon=defn.icon, owned=defn.owned_by_default,
    )

# 快照仍可只暴露 LEGACY_PART_IDS 七件，避免 UI 一次塞满未实装零件
LEGACY_UI_PART_IDS = ["camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"]
PARTS = [_part_card(PART_DEFINITIONS[i]) for i in LEGACY_UI_PART_IDS]
```

- [ ] **Step 4: 全量游戏测试**

Run: `pytest tests/test_game.py tests/test_game_blueprints.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/desktop_robot/game/engine.py src/desktop_robot/game/parts.py tests/test_game.py
git commit -m "$(cat <<'EOF'
refactor(game): 零件快照改为定义目录投影

EOF
)"
```

---

## Spec Coverage Self-Review

| 规格条目 | 对应任务 |
| --- | --- |
| §9.1 PartDefinition / PartInstance / Connection / Blueprint | Task 1–2 |
| §9.2 连接校验、无环、局部变换 | Task 2–4 |
| §10.2 版本迁移、经典小方、幂等、保留进度 | Task 3、5 |
| §11 阶段 A 退出：多实例、位姿连接保存、旧小方可恢复 | Task 2–3、5–6 |
| §13 两种结构验证抓取/轮距差异 | Task 4 |
| §11 验收「四轮独立实例」数据层 | Task 2–3 |
| 阶段 B–E 编辑器/物理/多解任务/多蓝图 UI | **不在本计划**（后续独立计划） |

## Placeholder Scan

无 TBD；测试中连接点 ID 须与 `parts.py` 最终命名对齐——实施 Task 2/4 时以代码为准改正测试字符串，不留空实现。

## Type Consistency

- `Pose` / `PartInstance` / `Connection` / `Blueprint` 命名在 Task 2 起固定，后续任务不得改名。
- 存档 JSON 使用 `model_dump(mode="json")`；读取用 `Blueprint.model_validate`。
- `active_blueprint_id` 与 `Blueprint.id` 字符串一致。

---

**Plan complete and saved to `docs/superpowers/plans/2026-09-21-freeform-robot-workshop-phase-a.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派生子代理，任务间复核，迭代快  
2. **Inline Execution** — 本会话用 executing-plans 连续执行，并设检查点  

**Which approach?**
