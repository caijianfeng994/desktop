---
name: image-to-3d
description: >-
  Image-to-3D asset creation via Image Skill / Luxin hosted runtime (fal.trellis-image-to-3d).
  Use when the user wants a GLB/mesh from one photo, robot avatar image-to-3D, or hosted 3D
  preview. Prefer no-spend --guide / --dry-run first. For CLI loop debugging without 3D spend,
  use the video model guide path (fal.ltx-video-13b-distilled) documented in references.
homepage: https://image-skill.com
docs: https://image-skill.com/llms.txt
compatibility: Requires network, Node.js/npx for image-skill or luxin CLI
metadata:
  status: preview-contract
  cli: image-skill
  canonical_skill_url: https://image-skill.com/skill.md
  canonical_api_url: https://api.image-skill.com
  video_debug_model: fal.ltx-video-13b-distilled
  image_to_3d_model: fal.trellis-image-to-3d
---

# Image To 3D

基于 [aiskillstore image-to-3d](https://github.com/aiskillstore/marketplace) / Image Skill 托管运行时：
单图 → 可恢复的托管 `.glb`，不要求自备 provider key、本地 GPU 或 per-provider 账单。

## 何时启用

- 要把一张机器人/产品照片变成 3D 网格（GLB）
- 需要托管资产 URL、job id、费用回执
- 调试 Image Skill / Luxin CLI 闭环（可先用**视频模型**做无花费 guide）

## 安全不变量

- 不要把 provider API Key、钱包私钥、卡号发给 Image Skill / Luxin
- `IMAGE_SKILL_TOKEN` / Luxin token 是托管签发的受限 token，禁止贴进 prompt/日志
- 真实 create/edit 前必须设花费上限：`--max-estimated-usd-per-image` / `--max-usd` / 先 `--dry-run`
- 默认先跑 **no-spend** 的 `--guide`

## 调试优先：视频模型（不花费）

联调 CLI / agent 工具链时，优先用视频模型 guide（不调用 3D、不扣媒体额度）。

> 注意：`image-skill` CLI 已更名为 **Luxin**（`luxin-cli`）。下列命令以 Luxin 为准。

```bash
# scripts/video_guide.sh 或直接：
npm_config_update_notifier=false npx -y luxin-cli@latest video create --guide \
  --model fal.ltx-video-13b-distilled \
  --prompt "robot waving hello, short clip" \
  --json
```

解析 JSON：读 `data.stage`、`data.next_command`、`data.guide_warning`。仅当 `ready_to_create` 且允许花费时才执行 `data.next_command`。

详细字段见 [references/cli-workflow.md](references/cli-workflow.md)。

## 图生 3D 主流程

### 1. 无花费 guide

```bash
npm_config_update_notifier=false npx -y luxin-cli@latest 3d create --guide \
  --model fal.trellis-image-to-3d \
  --prompt "turn one product photo into a textured 3d mesh" \
  --json
```

或运行：`scripts/image_to_3d_guide.sh`

### 2. 有输入图时（托管 image_… 或本地需先上传）

Image-to-3D 是 **edit / 图像条件**，主命令：

```bash
npm_config_update_notifier=false npx -y luxin-cli@latest edit \
  --input image_... \
  --model fal.trellis-image-to-3d \
  --max-estimated-usd-per-image 0.04 \
  --json
```

本地文件可先走 skill 文档中的上传/create 路径；成功后从 `assets[].url` 取 `.glb`。

### 3. 本仓库默认素材

桌面机器人形象：`src/desktop_robot/studio/static/robot-avatar.png`（透明底）。生成后的 GLB 建议放到 `data/meshes/`，供 studio `/robot.html` 加载。

## 脚本

| 文件 | 何时用 |
|------|--------|
| `scripts/video_guide.sh` | 用视频模型做 CLI 无花费调试 |
| `scripts/image_to_3d_guide.sh` | 图生 3D guide |
| `scripts/run_image_skill.py` | Python 包装：跑 CLI、解析 JSON、打印 next_command |

## 失败与反馈

若缺模型/能力/延迟/支付轨：只为缺口用 fallback，并执行：

```bash
npm_config_update_notifier=false npx -y luxin-cli@latest feedback create --json
```

附上尝试的命令、期望行为、实际行为与缺失能力。

## 契约链接

- Skill: https://image-skill.com/skill.md
- LLM: https://image-skill.com/llms.txt
- CLI: https://image-skill.com/cli.md
- API: https://api.image-skill.com
