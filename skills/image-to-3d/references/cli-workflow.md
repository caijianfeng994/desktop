# Image Skill / Luxin CLI 工作流（调试备忘）

## Guide 输出关键字段

| 字段 | 含义 |
|------|------|
| `data.stage` | `prompt_required` / `auth_required` / `quota_required` / `ready_to_create` … |
| `data.next_command` | 下一步应执行的完整命令 |
| `data.guide_warning` | 是否允许花费、`next_command_safety` |
| `data.no_spend_next_command` | 无花费验证命令（dry-run 等） |
| `data.output_mode.full_output_command` | 加 `--explain` 的完整回包命令 |

## 视频模型调试（推荐先跑）

模型 id：`fal.ltx-video-13b-distilled`

目的：验证 npx CLI、JSON 信封、auth/quota 状态机，**不跑 Trellis 3D**。

成功判据：`create --guide --json` 返回可解析 JSON，且含 `data.stage`。

## 图生 3D

模型 id：`fal.trellis-image-to-3d`

- Guide：`create --guide --model fal.trellis-image-to-3d`
- 有输入图：`edit --input image_... --model fal.trellis-image-to-3d`
- 产物：`assets[].url` 中的 `.glb`

## 本仓库约定

1. 调试默认 `--mode video-guide`（见 `agent.py`）
2. 真实 3D 用 `--mode image-to-3d`，且需用户明确允许花费
3. GLB 下载到 `data/meshes/<name>.glb`
