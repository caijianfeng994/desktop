# 3D 装配页与首页入口设计规格

- 日期：2026-09-16
- 状态：已确认，待实现
- 范围：新增 `/assembly-3d.html` 工程装配视图，并在 Studio 首页显示第三条入口

## 1. 目标

在不改变现有「形象与互动」五步流程和「机器人结构设计」工程参数流程的前提下，增加独立的 3D 装配查看页。

用户可以从首页直接进入 3D 装配页，并通过 `draft` 或 `robot` 参数加载同一份装配数据。页面按真实工程尺寸和坐标渲染，不使用 Studio 的 `x`、`y` 百分比布局坐标。

## 2. 首页入口

无 query 的 `/` 继续显示选轨首屏，但卡片由两张增加为三张：

1. **形象与互动**：进入现有五步。
2. **机器人结构设计**：进入 `/design.html`。
3. **3D 装配**：进入 `/assembly-3d.html`。

选轨区域文案改为「三条路线共用同一份机器人装配数据」。已有 `/?track=studio` 和 `/?draft=<id>` 行为保持不变。

本期仅要求首页卡片入口，不在现有顶栏增加强制入口。

## 3. 数据来源

3D 装配页支持：

- `/assembly-3d.html?draft=<uuid>`：读取 `/api/assembly/draft/<uuid>` 中的 `assembly` 和机器人名称。
- `/assembly-3d.html?robot=<uuid>`：读取 `/api/robot/<uuid>` 中护照的 `hardware` 和机器人名称。
- `/assembly-3d.html`：显示空场景和来源提示，不创建或猜测装配数据。

成功加载 assembly 后，调用 `POST /api/assembly/design-export` 获取工程 manifest。渲染只读取：

- `board.physical.dimensions_mm`
- `components[*].position_mm`
- `components[*].rotation_rpy_deg`
- `components[*].physical.dimensions_mm`
- `components[*].missing_engineering_data`
- `missing_engineering_data`
- `status`

## 4. 三维坐标和单位

manifest 使用 REP-103：

- `+X`：前
- `+Y`：左
- `+Z`：上

Three.js 场景映射：

- 工程 `X` → Three.js `Z`
- 工程 `Y` → Three.js `X`
- 工程 `Z` → Three.js `Y`

长度统一从毫米除以 `1000` 转成米。姿态由 `rotation_rpy_deg` 转弧度后应用，缺省姿态按 `(0, 0, 0)`。

页面必须明确显示坐标约定和单位。不得将 `x`、`y`、`z`、`rotation`、`scale` 布局字段转换为工程位姿。

## 5. 渲染规则

- 主控按 `board.physical.dimensions_mm` 绘制为 `base_link`，位于原点。
- 部件同时有 `position_mm` 和 `dimensions_mm`：按真实比例绘制实心盒体并应用姿态。
- 有 `position_mm`、缺 `dimensions_mm`：在真实位置绘制固定大小的线框占位符，标记「尺寸未补录」。
- 缺 `position_mm`：不放入场景，不猜测位置；在侧栏列入「未补录」。
- manifest 为 `provisional`：顶部显示警告和缺失字段。
- manifest 为 `ready`：显示工程数据已齐全，但不宣称无碰撞、可打印或通过制造验证。

场景包含：

- OrbitControls 旋转、缩放和平移
- 坐标轴
- 地面网格
- 部件名称标签或可识别图例
- 适配装配包围盒的自动相机定位

## 6. 页面结构

`assembly-3d.html` 包含：

- 顶栏：页面标题、数据状态、返回首页、进入结构设计。
- 主场景：Three.js Canvas。
- 侧栏：主控与部件清单、尺寸、位姿、缺失字段。
- 空状态：说明应从结构设计页补录尺寸和位姿。
- 错误状态：草稿/机器人不存在、护照无 hardware、导出接口失败。

结构设计链接保留当前来源：

- draft 来源 → `/design.html?draft=<uuid>`
- robot 来源 → `/design.html?robot=<uuid>`
- 无来源 → `/design.html`

## 7. 路由与技术约束

- `StudioHandler.do_GET` 注册 `/assembly-3d.html` 和 `/assembly-3d`。
- 页面沿用现有 import map 中的 Three.js `0.160.0` 与 `OrbitControls` CDN，不引入 npm 依赖。
- 不修改 `/api/generate`、技能目录、护照 `route`、五步顺序或聊天逻辑。
- 不在 3D 页面编辑或保存装配数据；本页只负责读取、导出 manifest 和查看。

## 8. 验证

自动测试至少覆盖：

- `/assembly-3d.html` 返回 200。
- 首页包含三张入口卡和 `/assembly-3d.html` 链接。
- 3D 页面包含 draft/robot 加载、`design-export` 调用、REP-103 映射、缺位姿不渲染等契约。
- 现有 HTTP、硬件装配、设计导出、生成与聊天测试继续通过。

手动验证：

1. 从首页进入空 3D 页面，显示空状态。
2. 从已有工程草稿进入，按真实毫米尺寸和位姿显示。
3. 缺位姿部件只出现在侧栏。
4. OrbitControls、相机自适应、结构设计回链可用。
