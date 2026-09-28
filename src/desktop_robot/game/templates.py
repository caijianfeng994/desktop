"""预制装配蓝图模板（四轮机架、工程机甲等）。"""

from __future__ import annotations

from desktop_robot.game.blueprints import Blueprint, Connection, PartInstance
from desktop_robot.game.parts import Pose

__all__ = [
    "empty_core_blueprint",
    "quad_chassis_arm_blueprint",
    "engineer_mecha_blueprint",
]

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
        bindings={
            "drive": [],
            "turn": [],
            "lift": ["joint-1", "joint-2"],
            "extend": [],
            "grasp": ["gripper-1"],
        },
    )


def engineer_mecha_blueprint(
    blueprint_id: str = "engineer-mecha",
    name: str = "工程机甲",
) -> Blueprint:
    """可辨认机甲轮廓：头罩、躯干甲、双肩、背包、腿架四轮、臂+夹爪、肩挂步枪。"""
    instances = [
        PartInstance("core-1", "core", _ZERO),
        PartInstance("head-1", "mecha_head", _ZERO),
        PartInstance("torso-1", "armor_torso", _ZERO),
        PartInstance("shoulder-l", "armor_shoulder", _ZERO),
        PartInstance("shoulder-r", "armor_shoulder", _ZERO),
        PartInstance("rifle-1", "weapon_rifle", _ZERO),
        PartInstance("pack-1", "backpack_frame", _ZERO),
        PartInstance("plate-1", "plate", _ZERO),
        PartInstance("leg-l", "mecha_leg", _ZERO),
        PartInstance("leg-r", "mecha_leg", _ZERO),
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
        Connection("core-1", "slot_head", "head-1", "mount", joint="fixed"),
        Connection("core-1", "mount_front", "torso-1", "mount", joint="fixed"),
        Connection("core-1", "slot_shoulder_l", "shoulder-l", "mount", joint="fixed"),
        Connection("core-1", "slot_shoulder_r", "shoulder-r", "mount", joint="fixed"),
        Connection("shoulder-r", "hardpoint", "rifle-1", "mount", joint="fixed"),
        Connection("core-1", "slot_backpack", "pack-1", "mount", joint="fixed"),
        Connection("core-1", "mount_bottom", "plate-1", "face_a", joint="fixed"),
        Connection("core-1", "mount_left", "leg-l", "mount", joint="fixed"),
        Connection("core-1", "mount_right", "leg-r", "mount", joint="fixed"),
        Connection("leg-l", "hub", "wheel-left", "hub", joint="fixed"),
        Connection("leg-r", "hub", "wheel-right", "hub", joint="fixed"),
        Connection("plate-1", "face_c", "wheel-front", "hub", joint="fixed"),
        Connection("plate-1", "face_d", "wheel-back", "hub", joint="fixed"),
        Connection("torso-1", "face_front", "joint-1", "in", joint="revolute"),
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
        bindings={
            "drive": [],
            "turn": [],
            "lift": ["joint-1", "joint-2"],
            "extend": [],
            "grasp": ["gripper-1"],
            "fire": ["rifle-1"],
        },
    )
