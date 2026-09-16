import re

from desktop_robot.hardware.design_export import build_design_manifest, export_urdf
from desktop_robot.hardware.types import HardwareAssembly, JointSpec, MountedComponent, PhysicalSpec


def test_manifest_keeps_ui_coordinates_out_of_engineering_pose():
    assembly = HardwareAssembly(
        board_id="board.pi-zero-2w",
        components=[
            MountedComponent(
                instance_id="arm-left",
                component_id="motion.arm-servo",
                slot_id="body.arm_left",
                x=99,
                y=1,
            )
        ],
    )
    manifest = build_design_manifest(assembly, robot_name="桌面伙伴")
    arm = manifest["components"][0]
    assert arm["position_mm"] is None
    assert "position_mm" in arm["missing_engineering_data"]
    assert manifest["status"] == "provisional"


def test_urdf_converts_units_computes_inertia_and_documents_assumptions():
    assembly = HardwareAssembly(
        board_id="board.pi-zero-2w",
        components=[
            MountedComponent(
                instance_id="left-arm",
                component_id="motion.arm-servo",
                position_mm=(100, 25, 50),
                rotation_rpy_deg=(0, 90, 0),
                joint=JointSpec(
                    name="left_shoulder_pitch",
                    type="revolute",
                    axis=(0, 1, 0),
                    lower=-90,
                    upper=90,
                    positive_motion="raises the arm",
                    source="measured prototype",
                ),
            )
        ],
    )
    urdf = export_urdf(assembly, robot_name="Desk Friend")
    assert '<robot name="desk_friend">' in urdf
    assert 'xyz="0.1 0.025 0.05"' in urdf
    assert 'rpy="0 1.5708 0"' in urdf
    assert 'lower="-1.5708" upper="1.5708"' in urdf
    assert '<mass value="0.009" />' in urdf
    assert "confidence=estimated" in urdf


def test_instance_physical_override_can_make_custom_part_ready():
    assembly = HardwareAssembly(
        board_id="board.pi-zero-2w",
        custom_components=[],
        components=[
            MountedComponent(
                instance_id="servo-1",
                component_id="motion.pan-tilt",
                position_mm=(0, 0, 40),
                physical_override=PhysicalSpec(
                    dimensions_mm=(40, 40, 35),
                    mass_g=35,
                    source="measured assembly",
                    confidence="exact",
                ),
            )
        ],
    )
    manifest = build_design_manifest(assembly)
    assert manifest["status"] == "ready"
    assert manifest["components"][0]["physical"]["source"] == "measured assembly"


def test_board_physical_override_is_layered_over_catalog_physical():
    assembly = HardwareAssembly(
        board_id="board.pi-zero-2w",
        board_physical_override=PhysicalSpec(
            dimensions_mm=(70, 35, 8),
            mass_g=22,
            mesh_path="cad/pi-zero-enclosure.stl",
            source="measured enclosure",
            confidence="exact",
        ),
    )

    manifest = build_design_manifest(assembly)

    assert manifest["status"] == "ready"
    assert manifest["board"]["physical"]["dimensions_mm"] == (70.0, 35.0, 8.0)
    assert manifest["board"]["physical"]["mass_g"] == 22
    assert manifest["board"]["physical"]["cad_query"] == "Raspberry Pi Zero 2 W"
    assert manifest["board"]["physical"]["mesh_path"] == "cad/pi-zero-enclosure.stl"
    assert manifest["board"]["physical"]["source"] == "measured enclosure"


def test_non_ascii_robot_names_get_distinct_stable_identifiers():
    first = HardwareAssembly(board_id="board.pi-zero-2w")
    second = HardwareAssembly(board_id="board.pi-zero-2w")

    first_manifest = build_design_manifest(first, robot_name="桌面伙伴")
    second_manifest = build_design_manifest(second, robot_name="工程葱")
    first_again = build_design_manifest(first, robot_name="桌面伙伴")

    first_name = first_manifest["robot_name"]
    second_name = second_manifest["robot_name"]
    assert re.fullmatch(r"robot_[0-9a-f]{8}", first_name)
    assert first_name == first_again["robot_name"]
    assert first_name != second_name
    assert f'<robot name="{first_name}">' in export_urdf(first, robot_name="桌面伙伴")


def test_ascii_robot_name_slug_is_unchanged():
    manifest = build_design_manifest(
        HardwareAssembly(board_id="board.pi-zero-2w"),
        robot_name="Desk Friend",
    )
    assert manifest["robot_name"] == "desk_friend"
