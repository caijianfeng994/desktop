# 双轨：形象互动与工程制造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有五步生成与对话行为的前提下，新增独立的工程制造路线，允许同一草稿或护照补录工程数据并导出 manifest 与 provisional URDF。

**Architecture:** 保留 `index.html` 作为形象互动向导，只在无 query 的根路径增加选轨首屏；新增独立 `design.html` 消费现有硬件、草稿、护照与设计导出 API。后端只增加草稿合并保存和护照硬件窄更新接口，运行技能目录、`/api/generate` 和聊天会话不改。

**Tech Stack:** Python 3、Pydantic、`http.server`、原生 HTML/CSS/JavaScript、pytest。

## Global Constraints

- 现有「身份 → 装配 → 接线 → 技能 → 生成 → 对话」步骤、校验与 `/api/generate` 契约保持不变。
- `Passport.route` 仍仅为 `default | custom`；顶层路线仅使用 URL `track=studio|design`。
- `x`、`y`、`z`、`rotation`、`scale` 只用于 Studio 布局，不得转换为 URDF 位姿。
- 工程数据仅使用 `position_mm`、`rotation_rpy_deg`、`parent_frame`、`joint`、`physical_override`。
- CAD/URDF/打印能力不得加入 `src/desktop_robot/skills/catalog.py`。
- 首版不调用 step-parts、CAD、DfAM 或 CAD Viewer。
- 缺工程数据允许导出，但必须明确标记 `provisional`。
- 不引入新前端依赖。

---

### Task 1: 草稿合并保存

**Files:**
- Modify: `src/desktop_robot/passport/store.py`
- Modify: `src/desktop_robot/studio/http_server.py:340-351`
- Test: `tests/test_hardware_http_api.py`

**Interfaces:**
- Consumes: 现有草稿字典以及 `assembly.components[*].instance_id`。
- Produces: `merge_assembly_draft(existing: dict, incoming: dict) -> dict`；`save_assembly_draft(..., merge_existing: bool = False)`。

- [ ] **Step 1: 写失败测试**

在 `tests/test_hardware_http_api.py` 新增：

```python
def test_draft_save_preserves_engineering_fields(tmp_path: Path):
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        first = post(
            port,
            "/api/assembly/save",
            {
                "assembly": {
                    **ASSEMBLY,
                    "components": [{
                        **ASSEMBLY["components"][0],
                        "x": 15,
                        "y": 25,
                        "position_mm": [10, 20, 30],
                        "rotation_rpy_deg": [0, 0, 90],
                    }],
                },
                "design_status": "ready",
                "track": "design",
            },
        )
        post(
            port,
            "/api/assembly/save",
            {
                "draft_id": first["draft_id"],
                "assembly": {
                    **ASSEMBLY,
                    "components": [{
                        **ASSEMBLY["components"][0],
                        "x": 55,
                        "y": 65,
                    }],
                },
                "name": "形象轨再次保存",
            },
        )
        with urlopen(
            f"http://127.0.0.1:{port}/api/assembly/draft/{first['draft_id']}",
            timeout=5,
        ) as response:
            saved = json.loads(response.read().decode("utf-8"))["data"]
        component = saved["assembly"]["components"][0]
        assert component["x"] == 55
        assert component["position_mm"] == [10, 20, 30]
        assert component["rotation_rpy_deg"] == [0, 0, 90]
        assert saved["design_status"] == "ready"
    finally:
        server.shutdown()
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `pytest tests/test_hardware_http_api.py::test_draft_save_preserves_engineering_fields -v`

Expected: FAIL，第二次保存后 `position_mm` 或 `design_status` 丢失。

- [ ] **Step 3: 实现递归到组件级的窄合并**

在 `src/desktop_robot/passport/store.py` 增加：

```python
def merge_assembly_draft(existing: dict, incoming: dict) -> dict:
    merged = dict(existing)
    merged.update({key: value for key, value in incoming.items() if key != "assembly"})
    if "assembly" not in incoming:
        return merged

    old_assembly = existing.get("assembly")
    new_assembly = incoming["assembly"]
    if not isinstance(old_assembly, dict) or not isinstance(new_assembly, dict):
        merged["assembly"] = new_assembly
        return merged

    assembly = dict(old_assembly)
    assembly.update({key: value for key, value in new_assembly.items() if key != "components"})
    old_components = {
        item.get("instance_id"): item
        for item in old_assembly.get("components", [])
        if isinstance(item, dict) and item.get("instance_id")
    }
    components = []
    for item in new_assembly.get("components", []):
        if not isinstance(item, dict):
            continue
        component = dict(old_components.get(item.get("instance_id"), {}))
        component.update(item)
        components.append(component)
    assembly["components"] = components
    merged["assembly"] = assembly
    return merged
```

将 `save_assembly_draft` 扩展为：

```python
def save_assembly_draft(
    data_root: Path,
    draft_id: str,
    payload: dict,
    *,
    merge_existing: bool = False,
) -> Path:
    path = draft_dir(data_root) / f"{draft_id}.json"
    if merge_existing and path.is_file():
        payload = merge_assembly_draft(load_assembly_draft(data_root, draft_id), payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
```

在 `_handle_assembly_save` 调用中传 `merge_existing=True`。

- [ ] **Step 4: 运行草稿与硬件 API 测试**

Run: `pytest tests/test_hardware_http_api.py tests/test_hardware_assembly.py -v`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/desktop_robot/passport/store.py src/desktop_robot/studio/http_server.py tests/test_hardware_http_api.py
git commit -m "fix(studio): 合并保存装配草稿工程字段"
```

---

### Task 2: 护照硬件窄更新接口

**Files:**
- Modify: `src/desktop_robot/studio/http_server.py`
- Test: `tests/test_hardware_http_api.py`

**Interfaces:**
- Consumes: `POST /api/robot/<uuid>/hardware`，请求体 `{ "assembly": HardwareAssembly }`。
- Produces: `{ "ok": true, "passport": ... }`，只更新 `Passport.hardware` 和 `passport_rev`。

- [ ] **Step 1: 写失败测试**

在 `tests/test_hardware_http_api.py` 引入 `generate_robot`，新增：

```python
def test_robot_hardware_update_does_not_change_skills_or_route(tmp_path: Path):
    robot = generate_robot(
        data_root=tmp_path,
        name="工程葱",
        route="custom",
        skill_ids=["chat.base", "body.wave"],
        hardware=ASSEMBLY,
    )
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        engineering = {
            **ASSEMBLY,
            "components": [{
                **ASSEMBLY["components"][0],
                "position_mm": [0, 0, 42],
                "rotation_rpy_deg": [0, 0, 0],
            }],
        }
        updated = post(
            port,
            f"/api/robot/{robot.robot_id}/hardware",
            {"assembly": engineering},
        )["passport"]
        assert updated["passport_rev"] == robot.passport_rev + 1
        assert updated["route"] == "custom"
        assert updated["installed_skill_ids"] == ["chat.base", "body.wave"]
        assert updated["hardware"]["components"][0]["position_mm"] == [0, 0, 42]
    finally:
        server.shutdown()
```

- [ ] **Step 2: 运行测试并确认 404**

Run: `pytest tests/test_hardware_http_api.py::test_robot_hardware_update_does_not_change_skills_or_route -v`

Expected: FAIL with HTTP 404。

- [ ] **Step 3: 增加路由和处理器**

在正则区增加：

```python
_ROBOT_HARDWARE_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/hardware$"
)
```

在 `do_POST` 中、`/api/chat` 前分派：

```python
hardware = _ROBOT_HARDWARE_RE.match(path)
if hardware:
    self._handle_robot_hardware_update(hardware.group(1), payload)
    return
```

实现：

```python
def _handle_robot_hardware_update(self, robot_id: str, payload: dict[str, Any]) -> None:
    assembly = self._assembly_from_payload(payload)
    if assembly is None:
        return
    path = passport_path(self.data_root, robot_id)
    try:
        passport = load_passport(path)
    except FileNotFoundError:
        self._json(404, {"ok": False, "reason": "机器人不存在"})
        return
    passport.hardware = assembly
    passport.passport_rev += 1
    save_passport(self.data_root, passport)
    self._json(200, {"ok": True, "passport": passport.model_dump()})
```

- [ ] **Step 4: 运行 API、护照与聊天回归**

Run: `pytest tests/test_hardware_http_api.py tests/test_passport_generate.py tests/test_studio_chat.py -v`

Expected: PASS；更新硬件后开聊规则和技能列表不变。

- [ ] **Step 5: 提交**

```bash
git add src/desktop_robot/studio/http_server.py tests/test_hardware_http_api.py
git commit -m "feat(studio): 新增护照硬件窄更新接口"
```

---

### Task 3: 顶层选轨与静态路由

**Files:**
- Modify: `src/desktop_robot/studio/http_server.py:99-114`
- Modify: `src/desktop_robot/studio/static/index.html`
- Create: `src/desktop_robot/studio/static/design.html`
- Test: `tests/test_hardware_http_api.py`

**Interfaces:**
- Consumes: URL `/?track=studio`、`/?draft=<uuid>`、`/design.html?draft=<uuid>`、`/design.html?robot=<uuid>`。
- Produces: 无 query 的 `/` 显示选轨；已有 query 直接显示旧五步；`/design.html` 返回工程页。

- [ ] **Step 1: 写失败的静态路由测试**

增加读取文本辅助函数及测试：

```python
def get_text(port: int, path: str) -> str:
    with urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as response:
        return response.read().decode("utf-8")


def test_dual_track_pages_are_served(tmp_path: Path):
    server = make_server("127.0.0.1", 0, tmp_path)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        index = get_text(port, "/")
        design = get_text(port, "/design.html")
        assert "选择创作路线" in index
        assert "形象与互动" in index
        assert "工程与制造" in index
        assert 'id="track-picker"' in index
        assert 'id="design-source"' in design
        assert "导出工程交接" in design
    finally:
        server.shutdown()
```

- [ ] **Step 2: 运行并确认 `/design.html` 404**

Run: `pytest tests/test_hardware_http_api.py::test_dual_track_pages_are_served -v`

Expected: FAIL with HTTP 404。

- [ ] **Step 3: 服务 `design.html`**

在 `do_GET` 的静态路由中增加：

```python
if path in ("/design.html", "/design"):
    self._write(200, (STATIC_DIR / "design.html").read_bytes(), "text/html; charset=utf-8")
    return
```

- [ ] **Step 4: 给现有页面增加非侵入选轨首屏**

在 `index.html` 的 `<main>` 前增加 `#track-picker`，包含两张按钮卡：

```html
<section class="track-picker" id="track-picker" hidden>
  <div>
    <h1>选择创作路线</h1>
    <p>两条路线共用同一份机器人装配数据，可以随时切换。</p>
  </div>
  <div class="track-grid">
    <button class="track-card" id="track-studio" type="button">
      <strong>形象与互动</strong>
      <span>外形、接线、技能、生成与对话</span>
    </button>
    <a class="track-card" href="/design.html">
      <strong>工程与制造</strong>
      <span>实际尺寸、三维位姿、关节与 URDF</span>
    </a>
  </div>
</section>
```

在现有初始化前增加：

```javascript
const routeParams = new URLSearchParams(location.search);
const showTrackPicker = !routeParams.has("track") && !routeParams.has("draft");
$("#track-picker").hidden = !showTrackPicker;
document.querySelector("main.page").hidden = showTrackPicker;
$("#track-studio").addEventListener("click", () => {
  history.replaceState(null, "", "/?track=studio");
  $("#track-picker").hidden = true;
  document.querySelector("main.page").hidden = false;
});
```

不要修改 `screenOrder`、`stepNames`、`assembly()`、`loadDraft()` 或 `#go` 的监听器。

- [ ] **Step 5: 创建工程页骨架**

创建 `design.html`，使用原生 CSS/JS，固定四步导航和这些容器：

```html
<nav id="design-steps">
  <button data-step="source">1 选择来源</button>
  <button data-step="physical">2 工程参数</button>
  <button data-step="pose">3 三维位姿</button>
  <button data-step="export">4 检查与导出</button>
</nav>
<main>
  <section id="design-source" data-screen="source"></section>
  <section id="design-physical" data-screen="physical" hidden></section>
  <section id="design-pose" data-screen="pose" hidden></section>
  <section id="design-export" data-screen="export" hidden>
    <button id="export-design" type="button">导出工程交接</button>
  </section>
</main>
```

初始化状态：

```javascript
const state = {
  draftId: null,
  robotId: null,
  name: "desktop_robot",
  assembly: null,
  catalog: { boards: [], components: [] },
  manifest: null,
  urdf: "",
};
```

- [ ] **Step 6: 运行静态路由测试和完整 HTTP 测试**

Run: `pytest tests/test_hardware_http_api.py -v`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/desktop_robot/studio/http_server.py src/desktop_robot/studio/static/index.html src/desktop_robot/studio/static/design.html tests/test_hardware_http_api.py
git commit -m "feat(studio): 增加形象与工程双轨入口"
```

---

### Task 4: 工程来源加载与参数编辑

**Files:**
- Modify: `src/desktop_robot/studio/static/design.html`
- Test: `tests/test_hardware_http_api.py`

**Interfaces:**
- Consumes: `/api/hardware/catalog`、`/api/assembly/draft/<id>`、`/api/robot/<id>`。
- Produces: `state.assembly`；`physical_override`、`parent_frame`、`position_mm`、`rotation_rpy_deg`、`joint` 的表单编辑。

- [ ] **Step 1: 写静态契约失败测试**

```python
def test_design_page_contains_engineering_contract(tmp_path: Path):
    html = (
        Path("src/desktop_robot/studio/static/design.html")
        .read_text(encoding="utf-8")
    )
    for field in (
        "dimensions_mm", "mass_g", "cad_query", "cad_source_url",
        "step_path", "mesh_path", "parent_frame", "position_mm",
        "rotation_rpy_deg", "joint.type", "joint.axis",
    ):
        assert field in html
    assert "布局数据不得用于 URDF" in html
    assert "/api/assembly/draft/" in html
    assert "/api/robot/" in html
```

- [ ] **Step 2: 运行并确认失败**

Run: `pytest tests/test_hardware_http_api.py::test_design_page_contains_engineering_contract -v`

Expected: FAIL，骨架尚无字段与加载逻辑。

- [ ] **Step 3: 实现来源加载**

在 `design.html` 中实现：

```javascript
async function loadCatalog() {
  const data = await fetch("/api/hardware/catalog").then(r => r.json());
  state.catalog = data;
}

async function loadSource() {
  const params = new URLSearchParams(location.search);
  state.draftId = params.get("draft");
  state.robotId = params.get("robot");
  if (state.draftId) {
    const data = await fetch(`/api/assembly/draft/${encodeURIComponent(state.draftId)}`).then(r => r.json());
    if (!data.ok) throw new Error(data.reason);
    state.assembly = data.data.assembly;
    state.name = data.data.name || state.name;
  } else if (state.robotId) {
    const data = await fetch(`/api/robot/${encodeURIComponent(state.robotId)}`).then(r => r.json());
    if (!data.ok || !data.passport.hardware) throw new Error(data.reason || "该机器人没有硬件装配");
    state.assembly = data.passport.hardware;
    state.name = data.passport.name;
  } else {
    state.assembly = {
      target_mode: "physical",
      board_id: "board.pi-zero-2w",
      components: [],
      custom_boards: [],
      custom_components: [],
      view_mode: "front",
      validation_rev: 3,
      allow_power_override: false,
    };
  }
}
```

404 或无硬件时在 `#source-error` 显示错误，同时保留「新建工程草稿」按钮。

- [ ] **Step 4: 实现工程参数与三维位姿表单**

以 `instance_id` 为键渲染 mounted component；输入框使用 `data-instance` 与 `data-field`。数组统一通过以下函数解析：

```javascript
function parseTriple(value, label) {
  const parts = value.split(",").map(part => Number(part.trim()));
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) {
    throw new Error(`${label} 必须是三个逗号分隔数字`);
  }
  return parts;
}
```

提交表单时只改：

```javascript
component.physical_override = {
  ...(component.physical_override || {}),
  dimensions_mm: parseTriple(form.elements.dimensions_mm.value, "实际尺寸"),
  mass_g: Number(form.elements.mass_g.value),
  cad_query: form.elements.cad_query.value || null,
  cad_source_url: form.elements.cad_source_url.value || null,
  step_path: form.elements.step_path.value || null,
  mesh_path: form.elements.mesh_path.value || null,
};
component.parent_frame = form.elements.parent_frame.value || "base_link";
component.position_mm = parseTriple(form.elements.position_mm.value, "安装位置");
component.rotation_rpy_deg = parseTriple(form.elements.rotation_rpy_deg.value, "安装旋转");
```

应用上述赋值前先验证 `mass_g > 0` 且三个尺寸都 `> 0`。非法值在页面标红，并将对应 `physical_override.mass_g` 或 `dimensions_mm` 置为 `null`，使导出保持 provisional，而不是向 Pydantic 后端发送负数。

若启用关节，再组装 `joint`；关节轴 `(0,0,0)` 在页面标红且本次保存将 `joint` 置空，使导出保持 provisional，不向后端发送无效运动学事实。

每个组件旁只读显示：

```text
布局数据：x=…%、y=…%、z=…、rotation=…、scale=…
布局数据不得用于 URDF。
```

- [ ] **Step 5: 实现草稿/护照保存**

```javascript
async function saveEngineering() {
  const designPayload = {
    assembly: state.assembly,
    name: state.name,
    design_status: "provisional",
    track: "design",
  };
  const url = state.robotId
    ? `/api/robot/${encodeURIComponent(state.robotId)}/hardware`
    : "/api/assembly/save";
  if (state.draftId) designPayload.draft_id = state.draftId;
  const data = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(designPayload),
  }).then(r => r.json());
  if (!data.ok) throw new Error(data.reason || "保存失败");
  if (data.draft_id) {
    state.draftId = data.draft_id;
    history.replaceState(null, "", `/design.html?draft=${encodeURIComponent(state.draftId)}`);
  }
}
```

- [ ] **Step 6: 运行契约测试和 HTTP 回归**

Run: `pytest tests/test_hardware_http_api.py tests/test_design_export.py -v`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/desktop_robot/studio/static/design.html tests/test_hardware_http_api.py
git commit -m "feat(studio): 支持补录工程参数与三维位姿"
```

---

### Task 5: 工程检查、导出与双向切轨

**Files:**
- Modify: `src/desktop_robot/studio/static/design.html`
- Modify: `src/desktop_robot/studio/static/index.html`
- Modify: `src/desktop_robot/studio/static/robot.html`
- Test: `tests/test_hardware_http_api.py`

**Interfaces:**
- Consumes: `POST /api/assembly/validate`、`POST /api/assembly/design-export`。
- Produces: 缺失清单、状态标签、manifest 下载、URDF 下载、返回形象轨链接。

- [ ] **Step 1: 写失败的页面行为契约测试**

```python
def test_dual_track_links_and_export_contract_are_present():
    root = Path("src/desktop_robot/studio/static")
    index = (root / "index.html").read_text(encoding="utf-8")
    robot = (root / "robot.html").read_text(encoding="utf-8")
    design = (root / "design.html").read_text(encoding="utf-8")
    assert "工程与制造" in index
    assert "工程与制造" in robot
    assert "/api/assembly/validate" in design
    assert "/api/assembly/design-export" in design
    assert "provisional，不可当作生产或仿真精确 URDF" in design
    assert 'download="design-manifest.json"' in design
    assert 'download="robot.urdf"' in design
```

- [ ] **Step 2: 运行并确认失败**

Run: `pytest tests/test_hardware_http_api.py::test_dual_track_links_and_export_contract_are_present -v`

Expected: FAIL，尚无导出下载和双向链接。

- [ ] **Step 3: 实现检查与导出**

在 `design.html` 实现：

```javascript
async function runChecks() {
  const [validation, exported] = await Promise.all([
    fetch("/api/assembly/validate", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({assembly: state.assembly}),
    }).then(r => r.json()),
    fetch("/api/assembly/design-export", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({robot_name: state.name, assembly: state.assembly}),
    }).then(r => r.json()),
  ]);
  if (!exported.ok) throw new Error(exported.reason || "工程导出失败");
  state.manifest = exported.manifest;
  state.urdf = exported.urdf;
  renderValidationWarning(validation.validation);
  renderExport(exported);
}
```

`renderExport` 必须：

- 展示 `manifest.status`。
- 展示每条 `missing_engineering_data`。
- `provisional=true` 时显示固定警告：`provisional，不可当作生产或仿真精确 URDF`。
- 功耗/端口 `validation.valid=false` 只显示警告，不禁用下载。
- 用 Blob URL 生成 `design-manifest.json` 和 `robot.urdf`。
- manifest `status=ready` 后再次保存，将草稿的 `design_status` 改为 `ready`。

- [ ] **Step 4: 增加双向切轨链接**

`design.html`：

```javascript
function studioHref() {
  return state.draftId ? `/?draft=${encodeURIComponent(state.draftId)}` : "/?track=studio";
}
```

`index.html` 顶栏增加次要链接，草稿存在时动态设置 `/design.html?draft=<id>`，否则 `/design.html`。不得把它放进 `screenOrder`。

`robot.html` 顶栏增加：

```html
<a id="design-link" href="/design.html">工程与制造</a>
```

护照加载后设置：

```javascript
document.getElementById("design-link").href =
  `/design.html?robot=${encodeURIComponent(robotId)}`;
```

- [ ] **Step 5: 运行页面契约和完整测试**

Run: `pytest -v`

Expected: 全部 PASS；尤其是现有生成、对话、发布、GLB 与装配测试。

- [ ] **Step 6: 手动冒烟**

Run:

```bash
python -m desktop_robot.studio
```

验证：

1. 打开 `/`，选择「形象与互动」，完整五步仍可生成并进入对话。
2. 打开 `/`，选择「工程与制造」，新建草稿并保存。
3. 为一个配件填写尺寸、质量、毫米位姿；导出 manifest 和 URDF。
4. 返回 `/?draft=<id>`，布局仍存在；再次保存后返回工程轨，工程字段仍存在。
5. 从 `robot.html` 进入工程轨，保存硬件后技能列表与聊天能力不变。

Expected: 五项均成功；缺数据时下载区明确显示 provisional 警告。

- [ ] **Step 7: 提交**

```bash
git add src/desktop_robot/studio/static/design.html src/desktop_robot/studio/static/index.html src/desktop_robot/studio/static/robot.html tests/test_hardware_http_api.py
git commit -m "feat(studio): 完成工程检查导出与双向切轨"
```

---

### Task 6: 最终回归与文档同步

**Files:**
- Modify: `README.md`
- Test: 全部测试

**Interfaces:**
- Consumes: 已完成的双轨页面与 API。
- Produces: 用户可执行的启动、选轨、导出说明。

- [ ] **Step 1: 更新 README**

在「装配硬件、接线并生成机器人」说明中补充：

```markdown
打开根页面后可选择两条共用装配数据的路线：

- 「形象与互动」保留原有五步，用于 GLB 形象、接线、运行技能和对话。
- 「工程与制造」用于补录实际尺寸、质量、三维位姿与关节，并导出 manifest 和 provisional URDF。

工程轨的 `ready` 只表示工程交接字段齐全，不代表已经通过碰撞、强度、热设计或可打印验证。
```

- [ ] **Step 2: 运行格式、静态检查和完整测试**

Run: `python -m compileall -q src && pytest -v`

Expected: 命令退出码 0，全部测试 PASS。

- [ ] **Step 3: 检查未误改技能目录和生成契约**

Run:

```bash
git diff -- src/desktop_robot/skills/catalog.py src/desktop_robot/passport/generate.py
```

Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "docs(studio): 补充形象与工程双轨使用说明"
```
