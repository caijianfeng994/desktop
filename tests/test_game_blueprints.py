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
