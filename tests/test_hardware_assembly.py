from pathlib import Path

import pytest

from desktop_robot.hardware.compatibility import assembly_capabilities, validate_assembly
from desktop_robot.hardware.types import HardwareAssembly, MountedComponent
from desktop_robot.hardware.wiring import auto_wire
from desktop_robot.passport.generate import GenerateError, generate_robot
from desktop_robot.passport.store import load_assembly_draft, save_assembly_draft


def mounted(component_id: str, slot: str, index: int) -> MountedComponent:
    return MountedComponent(
        instance_id=f"part-{index}",
        component_id=component_id,
        slot_id=slot,
        x=50,
        y=50,
    )


def complete_pi_assembly() -> HardwareAssembly:
    return HardwareAssembly(
        board_id="board.pi-zero-2w",
        components=[
            mounted("audio.usb-combo", "body.audio", 1),
            mounted("power.usb-15w", "body.power", 2),
            mounted("display.spi-35", "head.screen", 3),
            mounted("motion.pan-tilt", "neck.pan_tilt", 4),
        ],
    )


def test_complete_assembly_valid_and_unlocks_capabilities():
    assembly = complete_pi_assembly()
    result = validate_assembly(assembly)
    assert result.valid is True
    caps = assembly_capabilities(assembly)
    assert {"audio.input", "audio.output", "display.face"} <= caps
    assert {"motion.servo.yaw", "motion.servo.pitch"} <= caps
    assert result.totals["price_cny"] == 340


def test_missing_audio_and_power_is_invalid():
    result = validate_assembly(HardwareAssembly(board_id="board.pi-zero-2w"))
    assert result.valid is False
    codes = {issue.code for issue in result.issues}
    assert "missing_audio_input" in codes
    assert "missing_audio_output" in codes
    assert "missing_power_supply" in codes


def test_auto_wire_assigns_unique_ports():
    assembly = complete_pi_assembly()
    wires = auto_wire(assembly)
    assert wires
    assert len({wire.board_port for wire in wires}) == len(wires)
    assert any(wire.kind == "usb" for wire in wires)
    assert any(wire.kind == "pwm" for wire in wires)


def test_generate_rejects_skill_without_hardware(tmp_path: Path):
    assembly = complete_pi_assembly()
    with pytest.raises(GenerateError, match="技能与硬件不匹配"):
        generate_robot(
            data_root=tmp_path,
            name="没有手臂",
            route="custom",
            skill_ids=["chat.base", "body.wave"],
            hardware=assembly,
        )


def test_generate_saves_valid_hardware(tmp_path: Path):
    assembly = complete_pi_assembly()
    passport = generate_robot(
        data_root=tmp_path,
        name="硬件葱",
        route="custom",
        skill_ids=["chat.base", "face.perform", "body.nod"],
        hardware=assembly,
    )
    assert passport.status == "ready"
    assert passport.body == "linux"
    assert passport.hardware is not None
    assert "audio.input" in passport.hardware_capabilities


def test_assembly_draft_round_trip(tmp_path: Path):
    payload = {"name": "草稿", "assembly": complete_pi_assembly().model_dump()}
    save_assembly_draft(tmp_path, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", payload)
    assert load_assembly_draft(tmp_path, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") == payload


def test_pwm_shortage_suggests_expander_and_one_more_component_fixes_it():
    parts = [
        mounted("display.spi-35", "head.screen", 1),
        mounted("audio.usb-combo", "body.audio", 2),
        mounted("motion.pan-tilt", "neck.pan_tilt", 3),
        mounted("motion.arm-servo", "body.arm_left", 4),
        mounted("motion.arm-servo", "body.arm_right", 5),
        mounted("power.usb-25w", "body.power", 6),
        mounted("io.usb-hub", "body.expansion", 7),
    ]
    assembly = HardwareAssembly(board_id="board.orange-pi-zero-3", components=parts)
    before = validate_assembly(assembly)
    assert before.valid is False
    assert any(i.code == "pwm_exhausted" for i in before.issues)
    assert any(i.suggested_component_id == "io.pca9685" for i in before.issues)

    assembly.components.append(mounted("io.pca9685", "body.expansion_left", 8))
    after = validate_assembly(assembly)
    assert after.valid is True
    wires = auto_wire(assembly)
    assert any(w.board_port == "part-8:PWM1" for w in wires)


def test_every_esp32_compatibility_problem_has_a_user_choice():
    assembly = HardwareAssembly(
        board_id="board.esp32-s3",
        components=[
            mounted("display.spi-35", "head.screen", 1),
            mounted("audio.usb-combo", "body.audio", 2),
            mounted("sensor.usb-camera", "head.camera", 3),
            mounted("motion.pan-tilt", "neck.pan_tilt", 4),
            mounted("motion.arm-servo", "body.arm_left", 5),
            mounted("motion.arm-servo", "body.arm_right", 6),
            mounted("power.usb-25w", "body.power", 7),
            mounted("io.pca9685", "body.expansion_left", 8),
            mounted("mobility.tracks", "base.mobility", 9),
        ],
    )
    result = validate_assembly(assembly)
    assert result.valid is False
    assert result.blocking_count >= 1
    assert "才能创建机器人" in result.guidance[0]
    assert all(issue.actions for issue in result.issues)
    actions = {action.type for issue in result.issues for action in issue.actions}
    assert {"select_board", "remove_component", "replace_component"} <= actions


def overloaded_orange_pi_assembly(*, high_power: bool = False, override: bool = False) -> HardwareAssembly:
    return HardwareAssembly(
        board_id="board.orange-pi-zero-3",
        allow_power_override=override,
        components=[
            mounted("display.spi-35", "head.screen", 1),
            mounted("audio.usb-combo", "body.audio", 2),
            mounted("motion.pan-tilt", "neck.pan_tilt", 3),
            mounted("motion.arm-servo", "body.arm_left", 4),
            mounted("motion.arm-servo", "body.arm_right", 5),
            mounted("sensor.usb-camera", "head.camera", 6),
            mounted("power.pd-distribution-60w" if high_power else "power.usb-25w", "body.power", 7),
            mounted("io.pca9685", "body.expansion_left", 8),
            mounted("mobility.tracks", "base.mobility", 9),
            mounted("io.usb-hub", "body.expansion_right", 10),
        ],
    )


def test_power_overload_offers_larger_supply_and_non_blocking_override():
    blocked = validate_assembly(overloaded_orange_pi_assembly())
    overload = next(issue for issue in blocked.issues if issue.code == "power_overload")
    assert blocked.valid is False
    assert blocked.totals["power_w"] == 26.2
    assert blocked.totals["power_capacity_w"] == 25
    assert {action.type for action in overload.actions} >= {"replace_component", "accept_power_risk"}
    assert any(action.target_id == "power.pd-distribution-60w" for action in overload.actions)

    upgraded = validate_assembly(overloaded_orange_pi_assembly(high_power=True))
    assert upgraded.valid is True
    assert upgraded.totals["power_capacity_w"] == 60
    assert not any(issue.code == "power_overload" for issue in upgraded.issues)

    accepted = validate_assembly(overloaded_orange_pi_assembly(override=True))
    assert accepted.valid is True
    assert any(issue.code == "power_overload_accepted" for issue in accepted.issues)
    assert all(issue.level != "error" for issue in accepted.issues)


def test_catalog_contains_higher_power_and_compute_options():
    from desktop_robot.hardware.catalog import BOARDS, COMPONENTS

    assert BOARDS["board.raspberry-pi-5"].ports["usb"] == 4
    assert "edge_ai" in BOARDS["board.jetson-orin-nano-super"].capabilities
    assert COMPONENTS["power.pd-distribution-60w"].power_output_w == 60
