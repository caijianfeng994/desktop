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
