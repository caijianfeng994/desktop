"""空机架、四轮机架与工程机甲预制蓝图模板。"""

from desktop_robot.game.blueprints import Blueprint, validate_blueprint
from desktop_robot.game.templates import (
    empty_core_blueprint,
    engineer_mecha_blueprint,
    quad_chassis_arm_blueprint,
)


def test_empty_core_blueprint_validates():
    bp = empty_core_blueprint()
    assert isinstance(bp, Blueprint)
    assert validate_blueprint(bp) == []
    assert len(bp.instances) == 1
    assert bp.instances[0].part_id == "core"
    assert bp.connections == []


def test_quad_chassis_arm_template_validates():
    bp = quad_chassis_arm_blueprint()
    assert isinstance(bp, Blueprint)
    assert validate_blueprint(bp) == []
    assert bp.root_instance_id
    cores = [i for i in bp.instances if i.part_id == "core"]
    assert len(cores) == 1
    assert bp.root_instance_id == cores[0].instance_id
    assert sum(1 for i in bp.instances if i.part_id == "wheel") == 4
    assert sum(1 for i in bp.instances if i.part_id == "revolute_joint") == 2
    assert sum(1 for i in bp.instances if i.part_id == "gripper") == 1
    assert any(i.part_id == "plate" for i in bp.instances)
    assert any(i.part_id == "beam" for i in bp.instances)
    revolute_conns = [c for c in bp.connections if c.joint == "revolute"]
    assert len(revolute_conns) == 2


def test_engineer_mecha_template_validates_and_covers_zones():
    bp = engineer_mecha_blueprint()
    assert isinstance(bp, Blueprint)
    errors = validate_blueprint(bp)
    assert errors == [], errors
    part_ids = {i.part_id for i in bp.instances}
    for required in (
        "mecha_head",
        "armor_torso",
        "armor_shoulder",
        "backpack_frame",
        "mecha_leg",
        "weapon_rifle",
        "gripper",
        "wheel",
    ):
        assert required in part_ids
    assert sum(1 for i in bp.instances if i.part_id == "wheel") == 4
    assert sum(1 for i in bp.instances if i.part_id == "mecha_leg") == 2
    assert sum(1 for i in bp.instances if i.part_id == "armor_shoulder") == 2
    assert bp.bindings.get("fire") == ["rifle-1"]
    assert bp.bindings.get("grasp") == ["gripper-1"]
