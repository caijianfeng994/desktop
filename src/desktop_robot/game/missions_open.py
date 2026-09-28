"""开放挑战定义与结果判定（抽屉取物、跨桌缝救援）。"""

from __future__ import annotations

DRAWER_BLOCK_ID = "drawer-cube"
DESK_GAP_BLOCK_ID = "rescue-cube"
BOOKSHELF_BLOCK_ID = "bookshelf-rescue-cube"

CHALLENGE = dict(
    id="drawer-block",
    title="抽屉取物",
    subtitle="夹、推或拖，任选一条路",
    description="把抽屉缝里的方块运到接收区并停稳。不检查装配清单——结构与工具决定解法。",
    reward=150,
    xp=60,
    block_id=DRAWER_BLOCK_ID,
)

DESK_GAP_CHALLENGE = dict(
    id="desk-gap-rescue",
    title="跨桌缝救援",
    subtitle="抬高、够远或绕行",
    description="对岸桌面上的伙伴方块需要被救回近侧接收区。桌缝会掉落复位；可用长臂够取、推送或加宽底盘绕行。",
    reward=220,
    xp=90,
    block_id=DESK_GAP_BLOCK_ID,
)

BOOKSHELF_CHALLENGE = dict(
    id="bookshelf-rescue",
    title="书架救援",
    subtitle="绕开或击败巡逻敌机，救回上层维修机器人",
    description="倾斜书架上困着维修机器人。地面有巡逻敌机与掩体；可用射击清场、绞盘上锚或短时推进登高，将目标运回接收区。",
    reward=320,
    xp=140,
    block_id=BOOKSHELF_BLOCK_ID,
    loot=[
        {"type": "part", "part_id": "thruster_pack", "qty": 1},
        {"type": "schematic", "id": "schematic-winch", "name": "绞盘模块设计图", "unlocks": "winch_module"},
    ],
)

OPEN_CHALLENGES = [CHALLENGE, DESK_GAP_CHALLENGE, BOOKSHELF_CHALLENGE]
CHALLENGES_BY_ID = {c["id"]: c for c in OPEN_CHALLENGES}

# 方块速度阈值（m/s）：≈静止
_SPEED_EPS = 0.05


def evaluate_drawer_result(payload: dict | None) -> dict:
    """判定开放挑战结果。不检查 equipped / 零件清单。

    payload 需含 ``block_id``、``region``、``speed``；可选 ``challenge_id``。
    成功条件：block_id 匹配挑战目标、region==receive、speed<=0.05。
    """
    data = payload if isinstance(payload, dict) else {}
    challenge_id = data.get("challenge_id") or data.get("mission")
    challenge = CHALLENGES_BY_ID.get(challenge_id) if challenge_id else None
    expected_ids = {
        CHALLENGE["block_id"],
        DESK_GAP_CHALLENGE["block_id"],
        BOOKSHELF_CHALLENGE["block_id"],
    }
    if challenge:
        expected_ids = {challenge["block_id"]}

    block_id = data.get("block_id")
    region = data.get("region")
    speed_raw = data.get("speed")

    if block_id not in expected_ids:
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
