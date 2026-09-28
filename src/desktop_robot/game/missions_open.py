"""开放挑战定义与结果判定（抽屉取物、跨桌缝救援、书架救援）。

阶段4 闯关体系：把开放挑战组织成 3 章 × 3 关的节点图，每关带章节、顺序与前置。
解锁规则（见 ``challenge_status``）：章内线性解锁，章节首关以前一章末关为前置。
"""

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
    chapter=1,
    order=1,
    prereq=[],
)

DESK_GAP_CHALLENGE = dict(
    id="desk-gap-rescue",
    title="跨桌缝救援",
    subtitle="抬高、够远或绕行",
    description="对岸桌面上的伙伴方块需要被救回近侧接收区。桌缝会掉落复位；可用长臂够取、推送或加宽底盘绕行。",
    reward=220,
    xp=90,
    block_id=DESK_GAP_BLOCK_ID,
    chapter=2,
    order=1,
    prereq=["drawer-drag"],
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
    chapter=3,
    order=1,
    prereq=["desk-gap-wide"],
)

# 同机制变体节点：复用原方块与目标判定，仅标题/奖励/章节顺序不同，用于填满 3×3 地图。
_VARIANTS = [
    dict(id="drawer-precise", title="抽屉·稳准", subtitle="慢即是快", description="同样把方块搬进接收区，但结构更紧凑会更稳。", reward=180, xp=75, block_id=DRAWER_BLOCK_ID, chapter=1, order=2, prereq=["drawer-block"]),
    dict(id="drawer-drag", title="抽屉·巧劲", subtitle="拖，比夹更省力", description="用拖拽而非夹取完成搬运，体会不同工具的手感。", reward=200, xp=85, block_id=DRAWER_BLOCK_ID, chapter=1, order=3, prereq=["drawer-precise"]),
    dict(id="desk-gap-long", title="桌缝·长臂", subtitle="把臂伸到最远", description="用更长的臂或加高机身够取对岸方块。", reward=260, xp=105, block_id=DESK_GAP_BLOCK_ID, chapter=2, order=2, prereq=["desk-gap-rescue"]),
    dict(id="desk-gap-wide", title="桌缝·绕行", subtitle="把底盘加宽再越界", description="加宽底盘、降低重心，从桌缝上方稳稳越界。", reward=280, xp=115, block_id=DESK_GAP_BLOCK_ID, chapter=2, order=3, prereq=["desk-gap-long"]),
    dict(id="bookshelf-stealth", title="书架·潜行", subtitle="借掩体绕过巡逻", description="不硬碰敌机，用掩体与绞盘静默完成救援。", reward=360, xp=160, block_id=BOOKSHELF_BLOCK_ID, chapter=3, order=2, prereq=["bookshelf-rescue"]),
    dict(id="bookshelf-assault", title="书架·强攻", subtitle="清场后登高抢运", description="用火力清场，再短时推进登高把目标抢运回接收区。", reward=400, xp=180, block_id=BOOKSHELF_BLOCK_ID, chapter=3, order=3, prereq=["bookshelf-stealth"]),
]

OPEN_CHALLENGES = [CHALLENGE, DESK_GAP_CHALLENGE, BOOKSHELF_CHALLENGE, *_VARIANTS]
CHALLENGES_BY_ID = {c["id"]: c for c in OPEN_CHALLENGES}

CHAPTERS = [
    dict(id="ch1", title="桌面初探", blurb="熟悉夹、推、拖三种基本搬运。", chapter=1),
    dict(id="ch2", title="跨越边界", blurb="学会用长臂够远、底盘绕行与抬高。", chapter=2),
    dict(id="ch3", title="高处与威胁", blurb="面对倾斜书架、巡逻敌机与登高技术。", chapter=3),
]

# 方块速度阈值（m/s）：≈静止
_SPEED_EPS = 0.05


def challenge_status(completed: list | None) -> dict[str, str]:
    """返回 {challenge_id: 'done' | 'available' | 'locked'}。

    - done：已在 completed 中；
    - available：未完成且全部 prereq 已完成；
    - locked：否则。
    """
    done = set(completed or [])
    out = {}
    for c in OPEN_CHALLENGES:
        cid = c["id"]
        if cid in done:
            out[cid] = "done"
        elif all(p in done for p in c.get("prereq", [])):
            out[cid] = "available"
        else:
            out[cid] = "locked"
    return out


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
