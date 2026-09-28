# 视觉主题切换设计（温暖 / 机甲 / 废土 / 未来）

日期：2026-09-28  
状态：已批准并实施（2026-09-28）  
关联：[沉浸式 3D 体验方案](2026-09-24-immersive-3d-experience.md)

## 1. 目标

在**不改动现有入口与玩法**的前提下，新增可切换的视觉主题，让装配工坊与试验场更有科技感，同时保留当前「温暖工坊」作为默认。

| 主题 id | 中文名 | 气质 |
| --- | --- | --- |
| `warm` | 温暖 | 现有奶油木色（默认，行为不变） |
| `mecha` | 机甲 | A：冷青霓虹、深舱、高金属（环太平洋气质） |
| `wasteland` | 废土 | B：黄尘雾、锈橙金属、暗红警示 |
| `future` | 未来 | C：深灰底、克制青绿、干净工坊 |

成功标准：玩家在装配/试验场镜头栏一键切换，3D 材质灯光与 UI 同步变化；蓝图、碰撞、驾驶、抓取逻辑不变；刷新后记住上次选择。

## 2. 非目标（首版不做）

- 不新建完整机甲 mesh 或替换 `partVisuals` 几何拓扑。
- 不引入重量级后处理栈（如多层 bloom/体积光）；可选单层雾与 emissive 即可。
- 不改造主页 `scene.js` 大房间（二期可选同步）。
- 不改变物理尺寸、连接点、保存/试验场蓝图语义。

## 3. 架构

采用**主题包 + 一处切换**：

```
visualTheme.mjs          # 主题字典：色板、灯光、雾、材质覆写、环境色
materials.mjs            # materialForPart(partId, themeId?) 支持主题覆写
editorScene / yardScene  # setTheme(id) → 背景/灯/雾/重建零件材质/环境色
game.css                 # body[data-theme="…"] UI 覆写
game.html / game.js      # 镜头栏主题切换控件 + localStorage 同步
```

### 3.1 主题包字段

每个主题至少包含：

| 字段 | 用途 |
| --- | --- |
| `id` / `label` | 标识与 UI 文案 |
| `ui` | CSS 变量建议值（或仅靠 `data-theme` 类） |
| `scene.background` | Three 背景色 |
| `scene.fog` | `{near, far, color}` 或 `null`（`warm` 可为 null） |
| `lights.hemi` / `lights.sun` | 颜色与强度 |
| `env` | 地面/墙/坡/门/方块/接收区颜色与粗糙金属参数 |
| `materials` | 对 `metal/plastic/rubber/accent/tool` 的 color/roughness/metalness/emissive* 覆写 |
| `markers` | 连接点可用/不可用色（编辑器） |

`materialForPart(partId, themeId)`：在现有 preset 映射上合并主题覆写；缺省 `themeId` 等于 `warm`，与今日行为一致。

### 3.2 切换流程

1. 用户点击主题按钮 → `game.js` 设 `localStorage.gameVisualTheme` 与 `document.body.dataset.theme`。
2. 调用 `editorScene?.setTheme(id)`、`yardScene?.setTheme(id)`（已创建才调）。
3. 场景内：更新背景/雾/灯光；刷新环境 mesh 材质；对零件调用材质重建或 traverse 更新（不改 geometry）。
4. 低画质（已有 `setQuality('low')`）：禁用阴影的同时，**关闭雾或大幅拉远**，并清掉强 emissive，避免糊成一片。

### 3.3 持久化与默认

- Key：`localStorage.gameVisualTheme`
- 合法值：`warm` | `mecha` | `wasteland` | `future`
- 非法或缺失 → `warm`
- 装配与试验场共用同一存储；两栏控件保持勾选/高亮一致

## 4. UI 入口（保留现有入口）

在既有镜头栏旁增加主题组（不新增导航页、不改底栏）：

- 装配：`#build` 的 `.build-cam-bar` 内增加主题按钮组。
- 试验场：`#yard` 的镜头栏内同样一组。

文案：`温暖` / `机甲` / `废土` / `未来`。  
当前主题用 `aria-pressed` 或 `.is-active` 标出。

CSS：`body[data-theme="mecha|wasteland|future"]` 覆写纸面面板、主按钮、诊断 HUD、调试叠加等；`warm` 时不写 `data-theme` 或显式 `warm`，保持现有规则优先级。

## 5. 三主题视觉要点

### A · `mecha`

- 背景深青灰；雾冷青、偏近。
- 主光冷白偏青；半球光上亮下暗。
- 金属高 metalness、低 roughness；核心/夹爪带青绿 emissive。
- UI：深底、青描边、等宽感诊断字。

### B · `wasteland`

- 背景土黄灰；雾琥珀、较远。
- 主光暖黄偏脏；金属锈橙、粗糙高。
- 接收区/门用暗红警示色；地面偏尘土。
- UI：深褐底、锈橙强调、警告感边框。

### C · `future`

- 背景中深灰；雾弱或无。
- 主光中性偏凉；金属中等；点缀青绿但不抢。
- 地面干净、墙浅石墨；连接点清晰高对比。
- UI：石墨面板、细线描边、克制发光。

## 6. 文件变更清单

| 文件 | 变更 |
| --- | --- |
| 新建 `workshop/visualTheme.mjs` | 主题字典、`normalizeThemeId`、`getTheme` |
| 修改 `workshop/materials.mjs` | 主题感知材质 |
| 修改 `workshop/editorScene.mjs` | `setTheme`、应用灯光/材质 |
| 修改 `workshop/yardScene.mjs` | 同上 + 环境色 |
| 修改 `game.html` | 两处主题按钮 |
| 修改 `game.css` | `data-theme` 覆写 |
| 修改 `game.js` | 读写 localStorage、同步场景 |
| 新建/扩展 `tests/test_game_visual_theme.mjs` | id 规范化、材质覆写差异断言 |

## 7. 验收

- [ ] 默认进入仍为温暖；外观与今日一致（无主题键时）。
- [ ] 切换 A/B/C 后，装配画布与试验场背景、零件反光、环境色立即变化。
- [ ] 刷新页面后主题保持。
- [ ] 装配 → 进试验场主题一致；试验场改主题再回装配一致。
- [ ] 驾驶/抓取/保存/碰撞行为无回归。
- [ ] 低画质下主题仍可读，无过重雾/发光拖垮帧率。
- [ ] 单测：三主题材质至少在 color 或 metalness 上可区分；非法 id 回落 `warm`。

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 重建材质导致闪烁 | 优先 traverse 改 `material` 属性；必要时批量 rebuild |
| CSS 覆写漏网温暖样式 | 主题选择器只改关键面板变量，不全局重写字体栈 |
| 与沉浸式调试 HUD 冲突 | HUD 随 `data-theme` 配色，逻辑不变 |

## 9. 实施顺序建议

1. `visualTheme.mjs` + materials 主题覆写 + 单测  
2. editor/yard `setTheme`  
3. HTML/CSS/JS 切换与持久化  
4. 浏览器冒烟：四主题各截一帧 + 驾驶/抓取各一次  
