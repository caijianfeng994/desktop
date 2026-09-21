"""蓝图实例、连接图与无环连通校验。"""

from __future__ import annotations

from collections import defaultdict
from math import hypot

from pydantic import BaseModel, ConfigDict, Field

from desktop_robot.game.parts import Pose, get_part

__all__ = [
    "Blueprint",
    "Connection",
    "PartInstance",
    "Pose",
    "ValidationError",
    "classic_xiaofang_blueprint",
    "derived_equipped",
    "structure_metrics",
    "validate_blueprint",
    "world_poses",
]

_ROLL_TRACK = frozenset({"roll", "track"})
_TOOL_BEHAVIORS = frozenset({"grasp", "drag", "push"})

# 经典零件 → (core 父连接点, 子连接点)
_CLASSIC_MOUNT: dict[str, tuple[str, str]] = {
    "wheels": ("mount_bottom", "mount"),
    "tracks": ("mount_bottom", "mount"),
    "display": ("mount_front", "mount"),
    "camera": ("mount_top", "mount"),
    "arm": ("mount_right", "base"),
    "arm_left": ("mount_left", "base"),
    "battery": ("mount_back", "mount"),
}

# 单轮/驱动轮簇 → UI 认识的 wheels
_WHEEL_CLUSTER = frozenset({"wheel", "drive_wheel"})


class PartInstance(BaseModel):
    model_config = ConfigDict(frozen=True)

    instance_id: str
    part_id: str
    local_pose: Pose
    params: dict[str, float] = Field(default_factory=dict)

    def __init__(
        self,
        instance_id: str,
        part_id: str,
        local_pose: Pose,
        params: dict[str, float] | None = None,
        **data: object,
    ) -> None:
        # 支持 brief 测试中的位置参数构造
        super().__init__(
            instance_id=instance_id,
            part_id=part_id,
            local_pose=local_pose,
            params=params if params is not None else {},
            **data,
        )


class Connection(BaseModel):
    model_config = ConfigDict(frozen=True)

    parent_instance_id: str
    parent_point_id: str
    child_instance_id: str
    child_point_id: str
    joint: str = "fixed"

    def __init__(
        self,
        parent_instance_id: str,
        parent_point_id: str,
        child_instance_id: str,
        child_point_id: str,
        joint: str = "fixed",
        **data: object,
    ) -> None:
        # 支持 brief 测试中的位置参数构造
        super().__init__(
            parent_instance_id=parent_instance_id,
            parent_point_id=parent_point_id,
            child_instance_id=child_instance_id,
            child_point_id=child_point_id,
            joint=joint,
            **data,
        )


class Blueprint(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    root_instance_id: str
    instances: list[PartInstance]
    connections: list[Connection]
    bindings: dict[str, list[str]] = Field(default_factory=dict)
    version: int = 1


class ValidationError(BaseModel):
    model_config = ConfigDict(frozen=True)

    code: str
    message: str


def _point_map(part_id: str) -> dict[str, frozenset[str]]:
    part = get_part(part_id)
    return {p.id: p.kinds for p in part.connection_points}


def validate_blueprint(bp: Blueprint) -> list[ValidationError]:
    """校验蓝图；空列表表示通过。"""
    errors: list[ValidationError] = []
    by_id = {inst.instance_id: inst for inst in bp.instances}

    if len(by_id) != len(bp.instances):
        errors.append(ValidationError(code="duplicate_instance", message="实例 ID 重复"))

    if bp.root_instance_id not in by_id:
        errors.append(
            ValidationError(
                code="missing_root",
                message=f"根实例不存在: {bp.root_instance_id}",
            )
        )

    point_kinds: dict[str, dict[str, frozenset[str]]] = {}
    for inst in bp.instances:
        try:
            point_kinds[inst.instance_id] = _point_map(inst.part_id)
        except KeyError:
            errors.append(
                ValidationError(
                    code="unknown_part",
                    message=f"未知零件: {inst.part_id} (实例 {inst.instance_id})",
                )
            )
            point_kinds[inst.instance_id] = {}

    occupied: set[tuple[str, str]] = set()
    indegree: dict[str, int] = defaultdict(int)
    children: dict[str, list[str]] = defaultdict(list)

    for conn in bp.connections:
        if conn.parent_instance_id == conn.child_instance_id:
            errors.append(
                ValidationError(
                    code="self_connection",
                    message=f"禁止自连: {conn.parent_instance_id}",
                )
            )
            continue

        if conn.parent_instance_id not in by_id:
            errors.append(
                ValidationError(
                    code="unknown_instance",
                    message=f"连接引用未知父实例: {conn.parent_instance_id}",
                )
            )
            continue
        if conn.child_instance_id not in by_id:
            errors.append(
                ValidationError(
                    code="unknown_instance",
                    message=f"连接引用未知子实例: {conn.child_instance_id}",
                )
            )
            continue

        parent_points = point_kinds.get(conn.parent_instance_id, {})
        child_points = point_kinds.get(conn.child_instance_id, {})

        if conn.parent_point_id not in parent_points:
            errors.append(
                ValidationError(
                    code="missing_point",
                    message=(
                        f"父连接点不存在: {conn.parent_instance_id}.{conn.parent_point_id}"
                    ),
                )
            )
            continue
        if conn.child_point_id not in child_points:
            errors.append(
                ValidationError(
                    code="missing_point",
                    message=(
                        f"子连接点不存在: {conn.child_instance_id}.{conn.child_point_id}"
                    ),
                )
            )
            continue

        parent_kinds = parent_points[conn.parent_point_id]
        child_kinds = child_points[conn.child_point_id]
        if not (parent_kinds & child_kinds):
            errors.append(
                ValidationError(
                    code="incompatible_kinds",
                    message=(
                        f"连接点 kinds 无交集: "
                        f"{conn.parent_instance_id}.{conn.parent_point_id} "
                        f"↔ {conn.child_instance_id}.{conn.child_point_id}"
                    ),
                )
            )
            continue

        for key in (
            (conn.parent_instance_id, conn.parent_point_id),
            (conn.child_instance_id, conn.child_point_id),
        ):
            if key in occupied:
                errors.append(
                    ValidationError(
                        code="point_occupied",
                        message=f"连接点已被占用: {key[0]}.{key[1]}",
                    )
                )
            else:
                occupied.add(key)

        indegree[conn.child_instance_id] += 1
        children[conn.parent_instance_id].append(conn.child_instance_id)

    if bp.root_instance_id in by_id and indegree.get(bp.root_instance_id, 0) != 0:
        errors.append(
            ValidationError(
                code="cycle",
                message=f"根实例入度不为 0: {bp.root_instance_id}",
            )
        )

    for iid in by_id:
        if iid == bp.root_instance_id:
            continue
        deg = indegree.get(iid, 0)
        if deg == 0:
            # 可能是 disconnected；连通性检查会再报
            continue
        if deg > 1:
            errors.append(
                ValidationError(
                    code="cycle",
                    message=f"实例入度大于 1（非树）: {iid}",
                )
            )

    # 回边 / 环：从根 DFS，若再次访问已在路径上的节点则 cycle
    if bp.root_instance_id in by_id:
        path: set[str] = set()
        seen: set[str] = set()

        def dfs(node: str) -> None:
            if node in path:
                errors.append(
                    ValidationError(code="cycle", message=f"检测到环，涉及: {node}")
                )
                return
            if node in seen:
                return
            path.add(node)
            seen.add(node)
            for child in children.get(node, []):
                dfs(child)
            path.remove(node)

        dfs(bp.root_instance_id)

        reachable = seen
        for iid in by_id:
            if iid not in reachable:
                errors.append(
                    ValidationError(
                        code="disconnected",
                        message=f"实例从根不可达: {iid}",
                    )
                )

    return errors


def _point_pose(part_id: str, point_id: str) -> Pose:
    part = get_part(part_id)
    for point in part.connection_points:
        if point.id == point_id:
            return point.pose
    raise KeyError(f"连接点不存在: {part_id}.{point_id}")


def _compose_translation(parent: Pose, parent_pt: Pose, child_pt: Pose, child_local: Pose) -> Pose:
    """平移优先合成（父世界 + 父点 − 子点 + 子 local）。

    旋转字段保留但本阶段不参与合成；完整旋转将在阶段 C 接入。
    """
    return Pose(
        x=parent.x + parent_pt.x - child_pt.x + child_local.x,
        y=parent.y + parent_pt.y - child_pt.y + child_local.y,
        z=parent.z + parent_pt.z - child_pt.z + child_local.z,
        rx=child_local.rx,
        ry=child_local.ry,
        rz=child_local.rz,
    )


def world_poses(bp: Blueprint) -> dict[str, Pose]:
    """将局部位姿沿连接树合成世界位姿（平移优先；旋转待阶段 C）。"""
    by_id = {inst.instance_id: inst for inst in bp.instances}
    children: dict[str, list[Connection]] = defaultdict(list)
    for conn in bp.connections:
        children[conn.parent_instance_id].append(conn)

    poses: dict[str, Pose] = {}
    root = by_id[bp.root_instance_id]
    poses[root.instance_id] = root.local_pose

    stack = [root.instance_id]
    while stack:
        parent_id = stack.pop()
        parent_pose = poses[parent_id]
        parent_inst = by_id[parent_id]
        for conn in children.get(parent_id, []):
            child = by_id[conn.child_instance_id]
            parent_pt = _point_pose(parent_inst.part_id, conn.parent_point_id)
            child_pt = _point_pose(child.part_id, conn.child_point_id)
            poses[child.instance_id] = _compose_translation(
                parent_pose, parent_pt, child_pt, child.local_pose
            )
            stack.append(child.instance_id)
    return poses


def structure_metrics(bp: Blueprint) -> dict[str, float]:
    """结构度量：轮距、抓取半径、质量与质心（基于平移世界位姿）。"""
    poses = world_poses(bp)
    by_id = {inst.instance_id: inst for inst in bp.instances}

    roll_xz: list[tuple[float, float]] = []
    tool_reaches: list[float] = []
    tool_half_extents: list[float] = []
    mass_sum = 0.0
    mx = my = mz = 0.0

    root_pose = poses[bp.root_instance_id]

    for iid, pose in poses.items():
        part = get_part(by_id[iid].part_id)
        mass_sum += part.mass_kg
        mx += part.mass_kg * pose.x
        my += part.mass_kg * pose.y
        mz += part.mass_kg * pose.z

        if part.behaviors & _ROLL_TRACK:
            roll_xz.append((pose.x, pose.z))

        if part.behaviors & _TOOL_BEHAVIORS:
            reach = hypot(pose.x - root_pose.x, pose.z - root_pose.z)
            tool_reaches.append(reach)
            tool_half_extents.append(max(part.size_m) / 2.0)

    wheelbase_m = 0.0
    for i, (x1, z1) in enumerate(roll_xz):
        for x2, z2 in roll_xz[i + 1 :]:
            wheelbase_m = max(wheelbase_m, hypot(x1 - x2, z1 - z2))

    if tool_reaches:
        best_i = max(range(len(tool_reaches)), key=lambda i: tool_reaches[i])
        reach_m = tool_reaches[best_i]
        half = tool_half_extents[best_i]
    else:
        reach_m = 0.0
        half = 0.0

    inv = 1.0 / mass_sum if mass_sum else 0.0
    return {
        "wheelbase_m": wheelbase_m,
        "reach_m": reach_m,
        "grasp_radius_m": reach_m + half,
        "mass_kg": mass_sum,
        "com_x": mx * inv,
        "com_y": my * inv,
        "com_z": mz * inv,
    }


def classic_xiaofang_blueprint(
    equipped: list[str],
    blueprint_id: str = "classic",
) -> Blueprint:
    """由旧版 equipped 零件 ID 列表生成经典小方蓝图（固定 core-1 根）。"""
    zero = Pose()
    instances: list[PartInstance] = [
        PartInstance(instance_id="core-1", part_id="core", local_pose=zero),
    ]
    connections: list[Connection] = []

    for part_id in equipped:
        mount = _CLASSIC_MOUNT.get(part_id)
        if mount is None:
            continue
        parent_point, child_point = mount
        iid = f"{part_id}-1"
        instances.append(
            PartInstance(instance_id=iid, part_id=part_id, local_pose=zero)
        )
        connections.append(
            Connection(
                parent_instance_id="core-1",
                parent_point_id=parent_point,
                child_instance_id=iid,
                child_point_id=child_point,
            )
        )

    return Blueprint(
        id=blueprint_id,
        name="经典小方",
        root_instance_id="core-1",
        instances=instances,
        connections=connections,
    )


def derived_equipped(bp: Blueprint) -> list[str]:
    """从蓝图实例派生 UI equipped 列表：去重保序，跳过 core。"""
    seen: set[str] = set()
    result: list[str] = []
    for inst in bp.instances:
        if inst.part_id == "core":
            continue
        uid = "wheels" if inst.part_id in _WHEEL_CLUSTER else inst.part_id
        if uid in seen:
            continue
        seen.add(uid)
        result.append(uid)
    return result
