"""开放挑战定义与结果判定（抽屉取物）。"""

from __future__ import annotations

DRAWER_BLOCK_ID = "drawer-cube"

CHALLENGE = dict(
    id="drawer-block",
    title="抽屉取物",
    subtitle="夹、推或拖，任选一条路",
    description="把抽屉缝里的方块运到接收区并停稳。不检查装配清单——结构与工具决定解法。",
    reward=150,
    xp=60,
    block_id=DRAWER_BLOCK_ID,
)

OPEN_CHALLENGES = [CHALLENGE]

# 方块速度阈值（m/s）：≈静止
_SPEED_EPS = 0.05


def evaluate_drawer_result(payload: dict | None) -> dict:
    """判定抽屉挑战结果。不检查 equipped / 零件清单。

    payload 需含 ``block_id``、``region``、``speed``。
    成功条件：block_id 匹配、region==receive、speed<=0.05。
    """
    data = payload if isinstance(payload, dict) else {}
    block_id = data.get("block_id")
    region = data.get("region")
    speed_raw = data.get("speed")

    if block_id != DRAWER_BLOCK_ID and block_id != CHALLENGE.get("block_id"):
        return {"ok": False, "reason": "不是挑战目标方块。"}
    if region != "receive":
        return {"ok": False, "reason": "方块还没有进入接收区。"}

    try:
        speed = float(speed_raw)
    except (TypeError, ValueError):
        return {"ok": False, "reason": "缺少有效的速度读数。"}

    if speed > _SPEED_EPS:
        return {"ok": False, "reason": "方块还在移动，请等它停稳再提交。"}

    return {"ok": True, "reason": "方块已稳稳停在接收区。"}
