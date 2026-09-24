# 玩家自主设计 · 阶段 2–4 与自制组件

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans.

**Goal:** 完成规格阶段 2（控制）、3（结构反馈）、4（跨桌缝挑战）与自制组件，使玩家能从空机架造臂、绑定控制、诊断失稳并完成高度向多解挑战。

**Architecture:** `Blueprint.bindings` 为控制源；yard 经 `bindings.mjs` 驱动关节/伸缩/夹爪开合；诊断用姿态 COM；desk-gap 为第二开放挑战；组件为连通子图深拷贝库。

**Tech Stack:** 现有简化物理；不引入 Rapier。

## Global Constraints

- 规格 §5–§10；阶段 0–1 不回退。
- 验收以可试玩行为为准。
- 闭环连杆 / 齿轮 / 真实绞盘不在范围。

---

### Task A Phase2：bindings + 分轴 + 伸缩 + 夹爪开合

### Task B Phase3：姿态 COM 诊断 HUD

### Task C Phase4：desk-gap 挑战

### Task D：自制组件库

### Task E：测试提交

立即执行。

## 实施记录

- Phase2：`bindings.mjs`、Q/E 抬臂、Z/C 伸缩、F 开合、Space 抓取；关节限位 params；教学模板默认 bindings。
- Phase3：姿态 COM 诊断条、倾覆原因指向改装建议。
- Phase4：`desk-gap-rescue` 跨桌缝挑战（掉缝复位 + 高位方块）。
- 组件：`extractComponent` / `instantiateComponent` + `save_component` API。
- 测试：`tests/test_game_phase2_4_design.mjs`。
