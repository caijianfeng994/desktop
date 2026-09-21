"""蓝图实例、连接图与无环连通校验。"""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel, ConfigDict, Field

from desktop_robot.game.parts import Pose, get_part

__all__ = [
    "Blueprint",
    "Connection",
    "PartInstance",
    "Pose",
    "ValidationError",
    "validate_blueprint",
]


class PartInstance(BaseModel):
    model_config = ConfigDict(frozen=True)

    instance_id: str
    part_id: str
    local_pose: Pose
    params: dict[str, float] = Field(default_factory=dict)


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
