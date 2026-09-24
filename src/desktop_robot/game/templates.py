"""预制装配蓝图模板（四轮机架 + 两关节臂等）。"""

from __future__ import annotations

from desktop_robot.game.blueprints import Blueprint, Connection, PartInstance
from desktop_robot.game.parts import Pose

__all__ = ["empty_core_blueprint", "quad_chassis_arm_blueprint"]

_ZERO = Pose()


def empty_core_blueprint(
    blueprint_id: str = "empty-core",
    name: str = "空机架",
) -> Blueprint:
    """仅核心根节点，供玩家从零装配。"""
    return Blueprint(
        id=blueprint_id,
        name=name,
        root_instance_id="core-1",
        instances=[PartInstance("core-1", "core", _ZERO)],
        connections=[],
        bindings={},
    )


def quad_chassis_arm_blueprint(
    blueprint_id: str = "quad-chassis-arm",
    name: str = "四轮机架与两关节臂",
) -> Blueprint:
    """预制：core 根 + 底板 + 四轮 + 两转动关节臂 + 夹爪。"""
    instances = [
        PartInstance("core-1", "core", _ZERO),
        PartInstance("plate-1", "plate", _ZERO),
        PartInstance("wheel-left", "wheel", _ZERO),
        PartInstance("wheel-right", "wheel", _ZERO),
        PartInstance("wheel-front", "wheel", _ZERO),
        PartInstance("wheel-back", "wheel", _ZERO),
        PartInstance("joint-1", "revolute_joint", _ZERO),
        PartInstance("beam-1", "beam", _ZERO),
        PartInstance("joint-2", "revolute_joint", _ZERO),
        PartInstance("gripper-1", "gripper", _ZERO),
    ]
    connections = [
        # 底板挂在核心底部
        Connection("core-1", "mount_bottom", "plate-1", "face_a", joint="fixed"),
        # 四轮：核心左右 + 底板前后面（互不占用 mount_front）
        Connection("core-1", "mount_left", "wheel-left", "hub", joint="fixed"),
        Connection("core-1", "mount_right", "wheel-right", "hub", joint="fixed"),
        Connection("plate-1", "face_c", "wheel-front", "hub", joint="fixed"),
        Connection("plate-1", "face_d", "wheel-back", "hub", joint="fixed"),
        # 臂链：前向两关节 + 梁 + 夹爪
        Connection("core-1", "mount_front", "joint-1", "in", joint="revolute"),
        Connection("joint-1", "out", "beam-1", "end_b", joint="fixed"),
        Connection("beam-1", "end_a", "joint-2", "in", joint="revolute"),
        Connection("joint-2", "out", "gripper-1", "mount", joint="fixed"),
    ]
    return Blueprint(
        id=blueprint_id,
        name=name,
        root_instance_id="core-1",
        instances=instances,
        connections=connections,
        bindings={},
    )
