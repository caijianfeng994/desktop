# 选择技能并生成机器人（设计规格）

- 日期：2026-09-08
- 状态：已确认并实现
- 范围：领养路线 + 技能目录 + 生成护照 + 假 Body 对话
- 明确延后：公演、匹配、投票、真机绑定、刷机、技能商店审核

## 1. 目标与非目标

### 1.1 目标

非专业用户在本地用两种路线之一装配技能，生成一只带稳定 `robot_id` 的机器人；生成后可用现有 Brain + `fake` Body 对话。已安装技能决定本轮规划里 **允许出现哪些步骤**（`speak` / `set_face` / `look` / 内置 tools）。

成功标准：约五分钟内，默认套装可开聊；自创路线能从空槽勾选技能，效果说明可读；没装「基础对话」则不能开聊。

### 1.2 非目标

- 线上竞技场、回放、投票、排行
- 真机 `body_id`、小智绑定、镜像刷写、物流
- 用户粘贴任意代码、自选 GitHub 仓库、自选 STT/TTS/模型
- 多用户账号体系、云端同步
- 端到端策略训练（LeRobot 等）

### 1.3 约束

- 仍在本仓库实现，不新开前端工程
- Memory 继续用现有 SQLite：`facts` / `skill_weights` / `skill_traces`
- Body 协议不变：`speak` / `set_face` / `look` / `move`
- 学习机制（轨迹打分、权重）属于平台，不做成可卸载技能卡

## 2. 两条领养路线

领养第一步必选其一，生成后写入护照字段 `route`：`default` 或 `custom`。可从默认套装「拆开改装」变成 `custom`，`robot_id` 不变，`passport_rev` 加一。

### 2.1 路线 A：默认套装

一键生成，不进入空技能货架。预装且仅预装：

| 技能 id | 名称 |
|---------|------|
| `chat.base` | 基础对话 |
| `memory.base` | 基础记忆 |
| `face.perform` | 表情表演 |
| `memory.owner` | 记住主人 |
| `persona.cheer` | 人设：元气应援（第一版默认套装固定这一个，避免再套一层选择） |

生成后可立即对话。

### 2.2 路线 B：自创装配

进入时 **官方可选技能全部未安装**。用户逐张勾选；可填写至多 **1** 条自制技能（见 §4.3）。已安装总数（官方卡 + 自制）上限 **8**。

- 允许保存草稿护照：无 `chat.base` 时 `status=draft`
- `status=draft` 不得启动 `ConversationLoop`
- 安装 `chat.base` 后 `status=ready`，可以对话

空壳提示文案：`至少安装「基础对话」才能开始聊天。`

## 3. 技能目录

目录为静态数据（代码内常量或 JSON），每张卡字段固定：

| 字段 | 含义 |
|------|------|
| `id` | 稳定主键 |
| `name` | 展示名 |
| `summary` | 介绍（做什么） |
| `effect_web` | 装上之后在假 Body / 网页侧的效果 |
| `effect_device` | 装上之后在真机上的效果（本期只展示文案，不接线） |
| `grants` | 规划层解锁的步骤或工具名，见下表 |
| `is_chat_gate` | 是否为开聊门槛（仅 `chat.base` 为 true） |

第一版上架（自制除外）：

| id | 名称 | 介绍 | 装上之后（假 Body） | grants |
|----|------|------|---------------------|--------|
| `chat.base` | 基础对话 | 听懂并回答 | 可以一来一回聊天 | `speak` |
| `memory.base` | 基础记忆 | 明确说记住/忘掉才写入 | 「叫我某某」会写入 `facts`；可忘掉 | `set_preference`, `forget_preference` |
| `memory.owner` | 记住主人 | 强化称呼与短补充 | 生成时把名字/补充句写入 `facts`；对话注入 | 无新步骤；生成期写 facts |
| `face.perform` | 表情表演 | 按情绪切脸 | 规划允许 `set_face`，假 Body 打日志 | `set_face` |
| `look.at_user` | 看看我 | 「看看我/转过来」 | 规划允许 `look` | `look` |
| `clock.tell` | 报时 | 问现在几点 | 可走 `get_time` | `get_time` |
| `persona.cheer` | 元气应援 | 说话偏鼓励 | 规划回复风格偏应援（规则或前缀） | 无步骤 |
| `persona.roast` | 毒舌评委 | 说话偏犀利但禁止辱骂 | 回复风格偏毒舌 | 无步骤 |
| `persona.think` | 慢热哲学家 | 说话偏短、留白 | 回复风格偏克制 | 无步骤 |
| `persona.argue` | 抬杠选手 | 爱反问 | 回复风格偏抬杠 | 无步骤 |

未上架（目录里不要出现）：天气、笔记、走动、任意 GitHub 固件/模型。

人设包互斥：官方 `persona.*` 最多安装 **1** 个。自制技能不占这个互斥槽，但合计仍受 8 个上限。

### 3.1 规划过滤（硬规则）

`RulePlanner` 仍按用户文本出候选路径；执行前 **丢掉当前护照未 `grants` 的步骤**：

- 路径变得为空或不再含 `speak`，且已装 `chat.base`：降级为 `["speak"]`
- 未装 `chat.base`：不进入循环
- 未装 `memory.base`：即使用户说「叫我阿明」，也不调用 `set_preference`（可口头应答但不写库）
- 未装 `face.perform`：去掉所有 `set_face`
- 未装 `look.at_user`：去掉所有 `look`
- 未装 `clock.tell`：不走 `get_time`，改用普通 `speak` 回「我还不会报时」或 fallback

学习权重只在 **过滤后实际执行的路径** 上更新。

## 4. 护照与落盘

### 4.1 身份

| 字段 | 规则 |
|------|------|
| `robot_id` | 生成时创建，之后不改 |
| `user_id` | 本期固定本地 `"local"` |
| `body` | 固定 `"fake"` |
| `body_id` | 固定 `null` |
| `passport_rev` | 从 1 起，改装技能后加一 |
| `route` | `default` / `custom` |
| `status` | `draft` / `ready` |
| `name` | 展示名，必填，最长 16 字 |

### 4.2 护照 JSON

路径建议：`data/robots/<robot_id>/passport.json`。  
SQLite：`data/robots/<robot_id>/robot.db`（现有 `MemoryStore` schema，不新增表也可以；技能列表以 JSON 为准）。

护照至少包含：`robot_id`, `name`, `route`, `status`, `passport_rev`, `installed_skill_ids`, `custom_skill`（无则为 `null`）, `persona_id`（官方人设 id 或 null）, `facts_seed`。

`memory.owner` 或默认套装生成时：`facts` 写入 `user.call_me`（若用户填了名字以外的称呼则用称呼；否则用 `name`）以及可选 `prefer.extra`（自创补充句，最长 80 字）。

**对话内容不写入 facts。** traces 不进护照。

### 4.3 自制技能（一期从简）

用户可填：`name`, `summary`, `trigger`, `effect`（皆短文本）。  
一期不执行自定义代码、不开放新 `grants`。仅在规划 `fallback`/`greeting` 的回复前，把这四段作为风格前缀注入（有则注入，无则跳过）。不安全内容（指令注入、要求执行系统命令等）用拒绝列表粗滤，命中则不允许保存。

## 5. 界面与命令

### 5.1 本地一页

本仓库提供单页：选路线、起名、路线 B 勾选技能卡（展示 `summary` / `effect_web` / `effect_device`）、可选自制技能、生成。

生成成功展示：`robot_id`、已装列表、开聊命令。

### 5.2 开聊

```bash
python -m desktop_robot --body fake --db data/robots/<robot_id>/robot.db --passport data/robots/<robot_id>/passport.json
```

无 `--passport` 时行为与现在一致（视为全技能解锁，避免打断现有测试）；有护照则按 §3.1 过滤。

`status=draft` 时 CLI 退出码非 0，打印需安装基础对话。

## 6. 模块边界

| 单元 | 职责 |
|------|------|
| `skills/catalog.py` | 静态目录；查询 grants |
| `passport/types.py` | 护照 pydantic/dataclass |
| `passport/store.py` | 读写 JSON + 初始化 db |
| `passport/generate.py` | 校验路线、互斥、上限、开聊门槛；写盘 |
| `brain/loop.py`（小改） | 执行前按 grants 过滤步骤 |
| 单页 + 最小 HTTP | 只服务配置与生成，不复用小智 bridge 协议 |

假 Body、LearnEngine、MemoryStore 保持现有契约。

## 7. 异常

- 路线 B 超过 8 个技能 / 两个人设包：生成失败，中文原因
- 自制技能未过粗滤：生成失败
- 名字为空：生成失败
- 护照损坏或 grants 未知 id：开聊失败，不静默当全解锁
- LLM 本期仍可走规则规划；不把「选模型」暴露给用户

## 8. 测试与验收

1. 默认套装生成 → `status=ready`，db 存在，含预装五个 id；问候可 `set_face`+`speak`（假 Body 记录）
2. 自创无 `chat.base` → `draft`；带护照启动 REPL 失败
3. 自创仅 `chat.base` → 可聊；说「看看我」不出现 `look`；说「几点」不走 `get_time`
4. 加上 `look.at_user` / `clock.tell` 后对应步骤出现
5. 无 `memory.base` 时「叫我阿明」不写 `facts`
6. 目录每张卡都有介绍与双端效果字段
7. 现有无护照的 `pytest` 行为不变

## 9. 决策摘要

| 项 | 选择 |
|----|------|
| 本期产品 | 只生成机器人并假 Body 对话 |
| 路线 | 默认套装 vs 自创空槽 |
| 技能 | 静态目录 + 过滤 grants；学习不做成卡 |
| 自制 | 仅文案注入，无代码 |
| 部署 | 本仓库单页 + 护照 JSON + 现有 CLI |
| 比赛 / 真机 | 不做 |

## 10. 后续（非本期）

公演回放与投票、真机同步（`passport_rev`）、天气/笔记/走动上架、自制技能真正 `grants`。
