# 双轨：形象互动与工程制造（设计规格）

- 日期：2026-09-16
- 状态：已确认，待实现
- 范围：Studio 增加工程制造路线；与形象互动路线共用装配草稿 / 护照 `hardware`；首版导出 manifest 与 provisional URDF
- 明确延后：step-parts 自动检索、参数化 CAD 生成、URDF `--strict` 门禁、STL / DfAM、CAD Viewer 自动打开、可打印发布拦截

## 1. 目标与非目标

### 1.1 目标

在不改动现有「身份 → 装配 → 接线 → 技能 → 生成 → 对话」主路径内部逻辑的前提下，为工程数据补录与 URDF 交接单独开一条可见路线。

成功标准：

- 用户能从 Studio 选择「形象与互动」或「工程与制造」。
- 走形象轨仍能按现网五步生成机器人并进入 `robot.html` 开聊。
- 走工程轨能为同一草稿或护照补 `position_mm` / `rotation_rpy_deg` / `physical_override` / `joint`，并导出 manifest 与 URDF。
- 布局字段 `x` / `y` / `z` / `rotation` / `scale` 不被写成运动学来源。

### 1.2 非目标

- 替换或弱化图生 3D / `avatar.glb` 形象轨。
- 把 CAD、URDF、打印能力写入 `desktop_robot.skills.catalog` 或技能勾选网格。
- 首版串联 `$step-parts`、`$cad`、`$dfam-check`、`$cad-viewer` 自动流水线。
- 修改护照开聊语义（`status=draft|ready` 仍只由是否安装 `chat.base` 决定）。
- 新增第三种领养 `route`（护照 `route` 仍仅为 `default` | `custom`）。

### 1.3 约束

- 仍在本仓库静态页 + 现有 Studio HTTP 实现，不新开前端工程。
- 工程导出复用 `POST /api/assembly/design-export` 与 `hardware/types.py` 已有字段。
- `/api/generate` 的必填项、硬件校验失败即不可生成、必须安装 `chat.base` 才能开聊，均保持不变。
- Agent 编排继续放在 `skills/desktop-robot-design/`，不混入运行技能目录。

## 2. 导航与隔离

### 2.1 两条顶层路线

| 路线 | 用户目标 | 页面 | URL |
|------|----------|------|-----|
| 形象与互动 | GLB 外形、装配排版、接线、运行技能、生成护照、对话 | 现有五步（`index.html`） | `/?track=studio`；有草稿时 `/?draft=<id>` |
| 工程与制造 | 毫米位姿、物理参数、关节、manifest / URDF 导出 | 新页面 `design.html` | `/design.html`；`/design.html?draft=<id>` 或 `/design.html?robot=<id>` |

护照字段 `route`（`default` / `custom`）表示领养方式，与顶层 `track`（`studio` / `design`）无关。`track` 只存在于 URL 与草稿 JSON，不写入护照 `route`。

### 2.2 入口兼容（不影响现有流程）

- 现有五步的 DOM、步骤顺序、校验、生成按钮行为不改。
- `/?draft=<uuid>` 仍直接进入五步并加载该草稿，不经过选轨页。
- `/?track=studio` 直接进入五步。
- 无 query 的 `/` 增加选轨首屏（两张卡片）。选「形象与互动」进入现有五步，等价于今日从第一步开始；选「工程与制造」跳转 `design.html`。
- 装配台顶栏、`robot.html` 顶栏增加次要链接「工程与制造」，带上当前 `draft` 或 `robot` id；不插入新的必经步骤。
- `design.html` 顶栏提供「返回形象与互动」，打开同一 `draft` 的五步。

### 2.3 技能分类

运行技能仍只出现在形象轨第四步。工程轨不展示报时、挥手、视觉等卡片。设计/制造能力不以 SkillCard 形式进入 `catalog.py`。

## 3. 工程轨步骤

`design.html` 独立向导，四步：

1. **选择来源**：新建工程草稿；打开已有 `assembly-drafts`；或用 `robot_id` 载入护照 `hardware`。
2. **工程参数**：按已安装配件（含主控）编辑 / 覆盖 `PhysicalSpec`：`dimensions_mm`、`mass_g`、`cad_query`、`cad_source_url`、`step_path`、`mesh_path`、`mesh_units`、`source`、`confidence`。目录默认写入 catalog；实例差异写入 `MountedComponent.physical_override`。
3. **三维位姿**：编辑 `parent_frame`、`position_mm`、`rotation_rpy_deg`、可选 `JointSpec`。画布 `x/y/z/rotation/scale` 只读展示，导出 URDF 时忽略。
4. **检查与导出**：调用 `POST /api/assembly/design-export`，展示缺失清单、`provisional` / `ready`、manifest 摘要，提供下载或复制 URDF。

功耗 / 端口校验仍走 `POST /api/assembly/validate`。该校验失败在工程轨仅警告，不阻止导出。

## 4. 数据与 API

### 4.1 装配字段

以 `skills/desktop-robot-design/references/data-contract.md` 为准：

- 布局：`x`、`y`、`z`、`rotation`、`scale`
- 工程：`position_mm`、`rotation_rpy_deg`、`parent_frame`、`joint`、`physical_override`

保存草稿时必须原样保留布局字段；工程页不得把百分比坐标填进 `position_mm`。

### 4.2 草稿 JSON 增补

现有 `/api/assembly/save` 与 `assembly-drafts/<id>.json` 继续使用。允许增加可选字段，缺省不影响形象轨：

| 字段 | 含义 |
|------|------|
| `design_status` | `missing` \| `provisional` \| `ready`，仅工程轨展示 |
| `track` | 上次离开时的 `studio` 或 `design`，仅用于打开链接 |

`design_status=ready` 表示每个已挂载配件都有尺寸、质量、毫米位姿；不表示可打印、无碰撞或仿真可用。

形象轨保存草稿时若未带这些字段，服务端不得清空已有工程字段（`position_mm` 等）。实现上：保存为合并写入——形象轨提交的 `components` 按 `instance_id` 合并，未出现在提交中的工程键保留。

### 4.3 护照

- 不修改 `Passport.route` / `Passport.status` 语义。
- 工程轨从已生成机器人进入时，读写护照 `hardware`；保存工程字段后 `passport_rev` 加一。
- 不要求用户从工程轨调用 `/api/generate`。无护照时只维护草稿。

### 4.4 HTTP

| 方法 | 路径 | 变化 |
|------|------|------|
| GET | `/design.html` | 新增静态页 |
| GET | `/` | 无 query 时多选轨首屏；其余五步不变 |
| POST | `/api/assembly/design-export` | 已存在，工程页调用；契约不变 |
| POST | `/api/assembly/save` | 合并保存，避免形象轨覆盖工程字段 |
| GET | `/api/assembly/draft/<id>` | 返回完整草稿，含工程字段 |
| GET | `/api/robot/<id>` | 已存在；工程页用护照 `hardware` |
| PUT/POST | 护照 hardware 更新 | 新增窄接口，例如 `POST /api/robot/<id>/hardware`，只更新 `hardware` 与 `passport_rev`，不重跑图生 3D、不改技能列表 |

`POST /api/generate` 请求体与响应不变。

## 5. 切轨、错误处理

- 切轨只换页面，不新建 `robot_id`，不改 `installed_skill_ids`。
- 草稿或护照不存在：工程页提示并可新建草稿；形象轨 404/提示逻辑不变。
- 工程字段非法（质量 ≤ 0、关节轴为零向量等）：该行标红；仍允许导出，结果为 `provisional`。
- `design-export` 失败只显示在工程页；聊天与生成不受影响。
- 缺失工程数据允许导出，文案必须包含「provisional，不可当作生产或仿真精确 URDF」。
- 工程轨没有 `chat.base` 门槛。

## 6. 测试

必须继续通过：装配校验、生成护照、对话、现有 `test_design_export.py`。

新增：

- 草稿合并：先写入 `position_mm`，再用形象轨只带 `x/y` 的 payload 保存，读回后 `position_mm` 仍在。
- 有完整工程字段的装配导出 `provisional=false`（或 manifest `status=ready`）且 URDF 含对应 origin。
- 缺 `position_mm` 时 `provisional=true`，URDF 注释列出缺失。
- 无 query 的 `/` 含「工程与制造」入口；`/?track=studio` 仍能完成生成跳转（用现有 HTTP 测试或静态断言）。

## 7. 架构边界

- **Studio 静态页**：选轨、`design.html`、次要链接。
- **hardware**：类型、catalog 默认 `physical`、`design_export`；不把导出逻辑放进 `skills/catalog.py`。
- **passport store**：草稿合并保存；可选 `POST /api/robot/<id>/hardware`。
- **desktop-robot-design skill**：给 Agent 后续串联 CAD 工具链；本规格不要求 Studio 调用该 skill。
