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

## 假 Body 对话

```bash
python -m desktop_robot --body fake --db ./data/robot.db
```

试一句：`以后叫我阿明`，再 `你好`（应带称呼）。

## 学习验收（权重）

故意让 look 失败时，权重会下降（见 `tests/test_loop_contract.py`）。

## 小智 Body

```bash
python -m desktop_robot --body xiaozhi --body-url http://127.0.0.1:8787
```
