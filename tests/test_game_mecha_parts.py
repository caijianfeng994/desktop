"""机甲零件目录与核心区域挂点。"""

from __future__ import annotations

import pytest

from desktop_robot.game.parts import PART_DEFINITIONS, get_part


MECHA_PART_IDS = (
    "armor_torso",
    "armor_shoulder",
    "mecha_head",
    "mecha_leg",
    "backpack_frame",
    "weapon_rifle",
    "thruster_pack",
    "winch_module",
    "heavy_plate",
)

CORE_SLOTS = (
    "slot_head",
    "slot_shoulder_l",
    "slot_shoulder_r",
    "slot_backpack",
    "slot_hip",
)


def test_mecha_parts_exist_with_positive_mass_and_size():
    for part_id in MECHA_PART_IDS:
        part = get_part(part_id)
        assert part.mass_kg > 0
        assert len(part.size_m) == 3
        assert all(s > 0 for s in part.size_m)
        assert part.connection_points


def test_core_has_region_slots_and_legacy_mounts():
    core = get_part("core")
    ids = {p.id for p in core.connection_points}
    for slot in CORE_SLOTS:
        assert slot in ids
    for legacy in ("mount_top", "mount_front", "mount_left", "mount_right", "mount_bottom", "mount_back"):
        assert legacy in ids


def test_mecha_part_kinds_intersect_structure_or_specialty():
    core = get_part("core")
    slot_kinds = {p.id: p.kinds for p in core.connection_points}
    assert "structure" in slot_kinds["slot_head"]
    head = get_part("mecha_head")
    assert any(head.connection_points[0].kinds & slot_kinds["slot_head"])
    rifle = get_part("weapon_rifle")
    assert "weapon" in rifle.behaviors or "weapon" in set().union(*(p.kinds for p in rifle.connection_points))
    thrust = get_part("thruster_pack")
    assert "thrust" in thrust.behaviors
    winch = get_part("winch_module")
    assert "winch" in winch.behaviors


def test_catalog_size_grew():
    assert len(PART_DEFINITIONS) >= 28
