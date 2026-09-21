from desktop_robot.game.parts import PART_DEFINITIONS, get_part


def test_catalog_has_core_and_combinable_parts():
    required = {
        "core", "plate", "beam", "post", "wheel", "drive_wheel", "track_module",
        "revolute_joint", "prism_joint", "gripper", "pusher", "hook", "bucket",
        "battery", "camera", "display",
    }
    assert required <= set(PART_DEFINITIONS)
    core = get_part("core")
    assert "root" in {p.id for p in core.connection_points}
    assert core.mass_kg > 0
    wheel = get_part("wheel")
    assert "axle" in wheel.connection_points[0].kinds or any("axle" in p.kinds for p in wheel.connection_points)
    legacy = {"camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"}
    assert legacy <= set(PART_DEFINITIONS)  # 迁移别名仍可解析为定义


from desktop_robot.game.blueprints import (
    Blueprint,
    Connection,
    PartInstance,
    Pose,
    validate_blueprint,
)


def _inst(iid, pid, **pose):
    return PartInstance(
        instance_id=iid,
        part_id=pid,
        local_pose=Pose(**{**dict(x=0, y=0, z=0, rx=0, ry=0, rz=0), **pose}),
    )


def test_validate_accepts_core_with_four_wheels():
    bp = Blueprint(
        id="quad",
        name="四轮",
        root_instance_id="core-1",
        instances=[
            _inst("core-1", "core"),
            _inst("w1", "wheel"),
            _inst("w2", "wheel"),
            _inst("w3", "wheel"),
            _inst("w4", "wheel"),
        ],
        connections=[
            Connection("core-1", "mount_bottom", "w1", "hub"),
            Connection("core-1", "mount_left", "w2", "hub"),
            Connection("core-1", "mount_right", "w3", "hub"),
            Connection("core-1", "mount_back", "w4", "hub"),
        ],
    )
    assert validate_blueprint(bp) == []


def test_validate_rejects_cycle_and_missing_point():
    bp = Blueprint(
        id="bad",
        name="坏",
        root_instance_id="a",
        instances=[_inst("a", "plate"), _inst("b", "beam")],
        connections=[
            Connection("a", "face_a", "b", "end_a"),
            Connection("b", "end_b", "a", "face_b"),
        ],
    )
    codes = {e.code for e in validate_blueprint(bp)}
    assert "cycle" in codes or "disconnected" in codes or "point" in "".join(codes)


from desktop_robot.game.blueprints import (
    classic_xiaofang_blueprint,
    derived_equipped,
    structure_metrics,
)


def test_classic_template_from_equipped_roundtrip():
    equipped = ["wheels", "display", "camera", "arm", "arm_left"]
    bp = classic_xiaofang_blueprint(equipped)
    assert validate_blueprint(bp) == []
    assert bp.root_instance_id
    part_ids = [i.part_id for i in bp.instances]
    assert part_ids.count("core") == 1
    assert "arm" in part_ids and "arm_left" in part_ids
    assert set(derived_equipped(bp)) >= {"wheels", "display", "camera", "arm", "arm_left"}


def test_four_identical_wheels_are_distinct_instances():
    wheels = [_inst(f"w{i}", "wheel") for i in range(4)]
    assert len({w.instance_id for w in wheels}) == 4
    bp = Blueprint(
        id="quad-wheels",
        name="四轮手工",
        root_instance_id="core-1",
        instances=[_inst("core-1", "core"), *wheels],
        connections=[
            Connection("core-1", "mount_bottom", "w0", "hub"),
            Connection("core-1", "mount_left", "w1", "hub"),
            Connection("core-1", "mount_right", "w2", "hub"),
            Connection("core-1", "mount_back", "w3", "hub"),
        ],
    )
    assert validate_blueprint(bp) == []
    assert sum(1 for i in bp.instances if i.part_id == "wheel") == 4


def _pose(**kw):
    base = dict(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0)
    base.update(kw)
    return Pose(**base)


def test_longer_arm_increases_grasp_radius():
    short = Blueprint(
        id="short",
        name="短臂",
        root_instance_id="c",
        instances=[
            PartInstance("c", "core", _pose()),
            PartInstance("j", "revolute_joint", _pose()),
            PartInstance("g", "gripper", _pose()),
        ],
        connections=[
            Connection("c", "mount_front", "j", "in"),
            Connection("j", "out", "g", "mount"),
        ],
    )
    # end_b 接关节、end_a 接夹爪，使梁沿 +Z 前伸（out→end_a 会把梁折回）
    long = Blueprint(
        id="long",
        name="长臂",
        root_instance_id="c",
        instances=[
            PartInstance("c", "core", _pose()),
            PartInstance("j", "revolute_joint", _pose()),
            PartInstance("b", "beam", _pose()),
            PartInstance("g", "gripper", _pose()),
        ],
        connections=[
            Connection("c", "mount_front", "j", "in"),
            Connection("j", "out", "b", "end_b"),
            Connection("b", "end_a", "g", "mount"),
        ],
    )
    assert validate_blueprint(short) == []
    assert validate_blueprint(long) == []
    assert structure_metrics(long)["grasp_radius_m"] > structure_metrics(short)["grasp_radius_m"]


def _quad_wheels_blueprint(blueprint_id: str, half_track: float) -> Blueprint:
    """四轮底盘：左右轮 local_pose.x = ±half_track，前后轮保持 x=0。"""
    return Blueprint(
        id=blueprint_id,
        name=blueprint_id,
        root_instance_id="core-1",
        instances=[
            PartInstance("core-1", "core", _pose()),
            PartInstance("w-left", "wheel", _pose(x=-half_track)),
            PartInstance("w-right", "wheel", _pose(x=half_track)),
            PartInstance("w-front", "wheel", _pose()),
            PartInstance("w-back", "wheel", _pose()),
        ],
        connections=[
            Connection("core-1", "mount_left", "w-left", "hub"),
            Connection("core-1", "mount_right", "w-right", "hub"),
            Connection("core-1", "mount_front", "w-front", "hub"),
            Connection("core-1", "mount_back", "w-back", "hub"),
        ],
    )


def test_wider_wheelbase_is_larger():
    # classic 单 wheels 底盘轮距为 0；显式四轮 ±0.05 vs ±0.15 证明轮距差异
    _ = classic_xiaofang_blueprint(["wheels"])
    narrow = _quad_wheels_blueprint("narrow", half_track=0.05)
    wide = _quad_wheels_blueprint("wide", half_track=0.15)
    assert validate_blueprint(narrow) == []
    assert validate_blueprint(wide) == []
    assert structure_metrics(wide)["wheelbase_m"] > structure_metrics(narrow)["wheelbase_m"]
