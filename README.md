# 小小工坊 · desktop-robot

机器人装配、桌面冒险与伙伴养成游戏，保留 Brain / Body / Memory 和原有硬件工程工具。

## 改造方案

- [去方块化视觉、装配游戏化与闯关体系改造方案](docs/superpowers/specs/2026-09-28-visual-gameplay-level-redesign.md)：画面摆脱方块观感、装配取舍与多档结算、章节闯关结构，以及必须先完成的止血项。文档为设计提案，尚未实现。
- [自由装配与第一人称机甲动作游戏改造方案](docs/superpowers/specs/2026-09-28-mecha-action-redesign.md)：机甲外形变化、驾驶舱与第三人称切换、战斗流派、探索成长、首个可玩战场及分阶段验收。
- [真实 3D 游戏体验改进方案](docs/superpowers/specs/2026-09-24-immersive-3d-experience.md)：镜头与空间、机械模型、材质灯光、物理接触、声音反馈、最小验证场景与验收标准。
- [玩家自主设计与机械装配玩法方案](docs/superpowers/specs/2026-09-24-player-designed-mechanical-workshop.md)：从空机架设计、基础件与自制组件、连接和控制配置、结构反馈、空间冒险与分阶段验收。
- [第三轮自由装配试玩与优化方案](docs/superpowers/specs/2026-09-24-freeform-playtest-optimization.md)：模板与蓝图状态问题、复现步骤、P0/P1/P2 优先级、实施顺序及回归验收。
- [第二轮试玩与三维机架优化方案](docs/superpowers/specs/2026-09-22-3d-chassis-optimization.md)：第二关复测、完整三维机架、装配与物理模拟、实施顺序及验收标准。
- [实际试玩评估与优化清单](docs/superpowers/specs/2026-09-21-playtest-optimization.md)：首关试玩结果、P0/P1 问题、优化优先级、验收标准与玩家验证计划。
- [自由装配与物理挑战改造方案](docs/superpowers/specs/2026-09-21-freeform-robot-workshop-redesign.md)：竞品调研、三维装配、试验场、多解任务、技术架构、存档迁移与分阶段验收。文档为后续设计提案，新增能力尚未实现。

## 开始游戏

```bash
./scripts/start_studio.sh
```

打开 `http://127.0.0.1:8765/` 进入小小工坊。无需联网、模型 API 或真实硬件，即可玩完三项桌面委托。

- **工坊**：查看委托进度，点击右上电池补满电量。
- **改装**：点击或拖入零件；摄像头解锁扫描，左右机械臂可以独立装卸，任意一侧即可解锁搬运；双臂分别占用功耗和接口。第一关可先卸下屏幕腾出功耗，或购买扩容电池并安装。
- **委托**：接任务后点击桌面自动寻路，或用方向键逐格移动（先原地转向，再前进）；靠近目标按 `1` 扫描、`2` 搬运，回到青色充电站按 `3` 交付。
- **伙伴**：查看默契、回忆，修改名字与配色，并使用现有对话能力。配置 LLM 后聊天可使用模型；核心游戏不依赖模型。
- **图鉴**：查看零件，并进入原有高级装配、结构设计、3D 工程装配和制作发布大厅。

游戏存档位于 Studio 数据目录的 `workshop.sqlite3`，刷新和重启服务会恢复进度；任务中的位置、扫描、携带和朝向状态也保存。点击工坊、改装等导航会暂停任务并开放改装与充电；再次从委托板继续时重新检查装备，保留暂停前的探索进度。一个数据目录对应一个本地工坊。奖励仅在委托首次完成时发放；重复练习不重复产生货币。

游戏使用独立的虚拟零件与平衡数值，不会覆盖已有硬件装配草稿。第一次有效操作会创建独立伙伴护照，游戏中的改装不向真机发送指令。真实硬件制作仍使用独立工程校验。

三维场景使用仓库内置 Three.js，需浏览器支持 WebGL。当前实现为程序化三维游戏场景，参考概念图的色彩、布局与角色方向，并非概念图逐像素复刻。

- 设计规格：`docs/superpowers/specs/2026-09-07-self-learning-desktop-robot-design.md`
- 实现计划：`docs/superpowers/plans/2026-09-07-self-learning-desktop-robot.md`
- 1 期硬件：`docs/phase1-hardware-checklist.md`
- 小智冒烟：`scripts/smoke_xiaozhi.md`

## 安装

```bash
python3 -m pip install -e ".[dev]"
pytest
```

## 装配硬件、接线并生成机器人

```bash
./scripts/start_studio.sh
```

等价命令：`python -m desktop_robot.studio`。可用环境变量覆盖监听地址：`STUDIO_HOST`、`STUDIO_PORT`、`STUDIO_DATA`。

从游戏「图鉴」进入工程工具，或直接打开 `http://127.0.0.1:8765/?home=1`，可选择三个共用装配数据的入口：

- 「形象与互动」保留原有五步，用于 GLB 形象、接线、运行技能和对话。
- 「机器人结构设计」（`/design.html`）用于补录实际尺寸、质量、三维位姿与关节，并导出结构清单和 provisional URDF。
- 「3D 装配」（`/assembly-3d.html`）按毫米坐标把已补录的零件摆进三维场景，用 `?draft=<草稿ID>` 或
  `?robot=<机器人ID>` 指定数据；缺少 `position_mm` 的零件不会摆放，只在右侧清单里标注未补录字段。
  三维视图遵循 REP-103（+X 前、+Y 左、+Z 上），Three.js 运行时随仓库提供（`studio/static/vendor/three/`），无需联网。

工程轨的 `ready` 只表示工程交接字段齐全，不代表已经通过碰撞、强度、热设计或可打印验证。

「形象与互动」的五步：

1. 设置身份与外形；
2. 在装配页选择主控，并把屏幕、音频、舵机、摄像头、电源、Hub、履带等配件拖到机身；
3. 自动生成接线并按需手动调整端口；
4. 根据真实硬件能力选择技能；
5. 保存硬件护照并进入 3D 形象对话页。

装配台会实时检查功耗、端口、槽位和主控兼容性，支持正面、背面、3D 视角、自定义板卡/配件以及装配草稿恢复。

规格：`docs/superpowers/specs/2026-09-08-skill-select-generate-robot-design.md`

## Deep Agent（图生 3D / 视频模型调试）

按 [LangChain Deep Agents Skills](https://docs.langchain.com/oss/python/deepagents/skills) 与 aiskillstore `image-to-3d`：

```bash
.venv/bin/pip install -e ".[agent]"
# 无花费：用视频模型 fal.ltx-video-13b-distilled 调试 Image Skill CLI
.venv/bin/python agent.py --mode video-guide
# Trellis 图生 3D guide（仍默认 no-spend）
.venv/bin/python agent.py --mode image-to-3d
```

Skill 目录：`skills/image-to-3d/`（含 `SKILL.md`、scripts、references）。

## 机器人结构设计（CAD / URDF / 制作）

当前 Studio 产品能力仅补录工程字段，并导出设计 manifest 与
provisional / `ready` URDF。`skills/desktop-robot-design/` 描述的是 Agent
可编排的后续工具链（step-parts、CAD、DfAM、CAD Viewer 等），不代表首版
Studio 会自动调用这些步骤。GLB 继续负责机器人形象；CAD、URDF 与 SDF
负责真实尺寸、运动学、仿真和制造。

下面两条命令仅用于 Agent 后续的 CAD / Viewer 工具链，不是
`python -m desktop_robot.studio`、工程轨或 `/api/assembly/design-export`
的前置依赖：

```bash
.venv/bin/pip install -e ".[design]"
.venv/bin/python -m playwright install chromium  # CAD/URDF 快照与 Viewer 首次使用
```

装配数据可以通过 `POST /api/assembly/design-export` 导出：

```json
{
  "robot_name": "desk_friend",
  "assembly": {
    "board_id": "board.pi-zero-2w",
    "components": []
  }
}
```

响应包含工程数据缺失清单、设计 manifest 和带设计台账的 URDF。
Studio 的 `x/y` 百分比只用于界面排版。缺项允许 provisional 导出；要达到
当前 `ready`，需尺寸（`dimensions_mm`）、质量（`mass_g`）与 `position_mm` 齐全。
`rotation_rpy_deg` 缺省时按零姿态导出，不计入当前 `ready` 的缺失项。
`physical_override` 仅在实例值不同于 catalog 默认时需要；`joint` 仍为可选。

## 假 Body 对话

```bash
python -m desktop_robot --body fake --db ./data/robot.db
```

试一句：`以后叫我阿明`，再 `你好`（应带称呼）。

## 学习验收（权重）

故意让 look 失败时，权重会下降（见 `tests/test_loop_contract.py`）。

## 小智 Body（本地桥）

先起桥，再开 REPL（详见 `scripts/smoke_xiaozhi.md`）：

```bash
python -m desktop_robot.bridge --tts say
python -m desktop_robot --body xiaozhi --body-url http://127.0.0.1:8787
```
