# desktop-robot

自学习桌面机器人（Brain / Body / Memory）。

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
python -m desktop_robot.studio
```

打开根页面 `http://127.0.0.1:8765/` 后可选择两条共用装配数据的路线：

- 「形象与互动」保留原有五步，用于 GLB 形象、接线、运行技能和对话。
- 「工程与制造」用于补录实际尺寸、质量、三维位姿与关节，并导出 manifest 和 provisional URDF。

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

## 工程设计（CAD / URDF / 制造）

当前 Studio 产品能力仅补录工程字段，并导出设计 manifest 与
provisional / `ready` URDF。`skills/desktop-robot-design/` 描述的是 Agent
可编排的后续工具链（step-parts、CAD、DfAM、CAD Viewer 等），不代表首版
Studio 会自动调用这些步骤。GLB 继续负责机器人形象；CAD、URDF 与 SDF
负责真实尺寸、运动学、仿真和制造。

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
当前 `ready`，需尺寸、质量、毫米位姿（`position_mm`、`rotation_rpy_deg`）齐全。
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
