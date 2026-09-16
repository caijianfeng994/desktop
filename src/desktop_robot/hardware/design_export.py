from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass
from html import escape

from desktop_robot.hardware.catalog import get_catalog
from desktop_robot.hardware.types import HardwareAssembly, JointSpec, PhysicalSpec


@dataclass(frozen=True)
class DesignExport:
    manifest: dict
    urdf: str


def _identifier(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_").lower()
    if cleaned:
        return cleaned
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]
    return f"robot_{digest}"


def _effective_physical(default: PhysicalSpec, override: PhysicalSpec | None) -> PhysicalSpec:
    if override is None:
        return default
    base = default.model_dump()
    for key, value in override.model_dump().items():
        if value not in (None, "", "unspecified", "unknown"):
            base[key] = value
    return PhysicalSpec.model_validate(base)


def _component_record(mounted, card) -> dict:
    physical = _effective_physical(card.physical, mounted.physical_override)
    missing = []
    if physical.dimensions_mm is None:
        missing.append("dimensions_mm")
    if physical.mass_g is None:
        missing.append("mass_g")
    if mounted.position_mm is None:
        missing.append("position_mm")
    return {
        "instance_id": mounted.instance_id,
        "catalog_id": card.id,
        "name": card.name,
        "slot_id": mounted.slot_id,
        "parent_frame": mounted.parent_frame,
        "position_mm": list(mounted.position_mm) if mounted.position_mm else None,
        "rotation_rpy_deg": list(mounted.rotation_rpy_deg) if mounted.rotation_rpy_deg else None,
        "joint": mounted.joint.model_dump() if mounted.joint else None,
        "physical": physical.model_dump(),
        "missing_engineering_data": missing,
    }


def build_design_manifest(assembly: HardwareAssembly, *, robot_name: str = "desktop_robot") -> dict:
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    if board is None:
        raise ValueError(f"未知主控板: {assembly.board_id}")

    records = []
    for mounted in assembly.components:
        card = components.get(mounted.component_id)
        if card is None:
            continue
        records.append(_component_record(mounted, card))

    missing = [
        {"instance_id": item["instance_id"], "fields": item["missing_engineering_data"]}
        for item in records
        if item["missing_engineering_data"]
    ]
    board_physical = _effective_physical(board.physical, assembly.board_physical_override)
    board_missing = []
    if board_physical.dimensions_mm is None:
        board_missing.append("dimensions_mm")
    if board_physical.mass_g is None:
        board_missing.append("mass_g")
    if board_missing:
        missing.insert(0, {"instance_id": "base_link", "fields": board_missing})
    return {
        "schema_version": 1,
        "robot_name": _identifier(robot_name),
        "units": {"length": "mm", "mass": "g", "angles": "degrees"},
        "frame_convention": "+X forward, +Y left, +Z up (REP-103)",
        "status": "ready" if not missing else "provisional",
        "board": {
            "catalog_id": board.id,
            "name": board.name,
            "physical": board_physical.model_dump(),
        },
        "components": records,
        "missing_engineering_data": missing,
        "handoff": {
            "part_discovery": "step-parts",
            "geometry": "cad",
            "robot_description": "urdf",
            "simulation": "sdf",
            "printability": "dfam-check",
            "review": "cad-viewer",
        },
    }


def _meters(values: tuple[float, float, float]) -> str:
    return " ".join(f"{value / 1000:.6g}" for value in values)


def _radians(values: tuple[float, float, float]) -> str:
    return " ".join(f"{math.radians(value):.6g}" for value in values)


def _box_inertia(mass_kg: float, dimensions_mm: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = (value / 1000 for value in dimensions_mm)
    return (
        mass_kg * (y * y + z * z) / 12,
        mass_kg * (x * x + z * z) / 12,
        mass_kg * (x * x + y * y) / 12,
    )


def _joint_xml(joint: JointSpec | None, *, parent: str, child: str, origin_mm, rpy_deg) -> list[str]:
    spec = joint or JointSpec(name=f"{parent}_to_{child}")
    lines = [f'  <joint name="{escape(_identifier(spec.name))}" type="{spec.type}">']
    lines.extend(
        [
            f'    <parent link="{escape(_identifier(parent))}" />',
            f'    <child link="{escape(child)}" />',
            f'    <origin xyz="{_meters(origin_mm)}" rpy="{_radians(rpy_deg)}" />',
        ]
    )
    if spec.type != "fixed":
        lines.append(f'    <axis xyz="{" ".join(f"{v:g}" for v in spec.axis)}" />')
    if spec.type in ("revolute", "prismatic"):
        lower = spec.lower if spec.lower is not None else 0.0
        upper = spec.upper if spec.upper is not None else 0.0
        if spec.type == "revolute":
            lower, upper = math.radians(lower), math.radians(upper)
        else:
            lower, upper = lower / 1000, upper / 1000
        lines.append(
            f'    <limit lower="{lower:.6g}" upper="{upper:.6g}" effort="{spec.effort:g}" velocity="{spec.velocity:g}" />'
        )
    lines.append("  </joint>")
    return lines


def export_urdf(assembly: HardwareAssembly, *, robot_name: str = "desktop_robot") -> str:
    manifest = build_design_manifest(assembly, robot_name=robot_name)
    assumptions = []
    for item in manifest["components"]:
        if item["missing_engineering_data"]:
            assumptions.append(
                f"{item['instance_id']}: missing {', '.join(item['missing_engineering_data'])}; exported as a frame-only or zero-pose provisional link"
            )
        physical = item["physical"]
        if physical["confidence"] != "exact":
            assumptions.append(
                f"{item['instance_id']}: physical metadata confidence={physical['confidence']} source={physical['source']}"
            )

    lines = [
        '<?xml version="1.0"?>',
        "<!--",
        f"  robot: {manifest['robot_name']} | consumers: CAD Viewer, RViz, robot_state_publisher",
        "  units: meters, kilograms, radians | frames: +X forward, +Y left, +Z up (REP-103)",
        "  root: base_link | source of dimensions: desktop-robot hardware catalog and per-instance overrides",
        "  meshes: none; primitive collision/visual boxes only when dimensions are known",
        "  inertials: solid-box formula when dimensions and mass are known; otherwise omitted",
        "  assumptions:",
        *[f"  - {text}" for text in assumptions],
        "-->",
        f'<robot name="{escape(manifest["robot_name"])}">',
    ]

    board_physical = manifest["board"]["physical"]
    board_dimensions = board_physical["dimensions_mm"]
    board_mass_g = board_physical["mass_g"]
    lines.append('  <link name="base_link">')
    if board_dimensions and board_mass_g:
        mass_kg = board_mass_g / 1000
        ixx, iyy, izz = _box_inertia(mass_kg, tuple(board_dimensions))
        size = _meters(tuple(board_dimensions))
        lines.extend(
            [
                "    <inertial>",
                '      <origin xyz="0 0 0" rpy="0 0 0" />',
                f'      <mass value="{mass_kg:.6g}" />',
                f'      <inertia ixx="{ixx:.9g}" ixy="0" ixz="0" iyy="{iyy:.9g}" iyz="0" izz="{izz:.9g}" />',
                "    </inertial>",
                "    <visual>",
                '      <origin xyz="0 0 0" rpy="0 0 0" />',
                f'      <geometry><box size="{size}" /></geometry>',
                "    </visual>",
                "    <collision>",
                '      <origin xyz="0 0 0" rpy="0 0 0" />',
                f'      <geometry><box size="{size}" /></geometry>',
                "    </collision>",
            ]
        )
    lines.append("  </link>")

    for item in manifest["components"]:
        link = f"{_identifier(item['instance_id'])}_link"
        physical = item["physical"]
        dimensions = physical["dimensions_mm"]
        mass_g = physical["mass_g"]
        lines.append(f'  <link name="{escape(link)}">')
        if dimensions and mass_g:
            mass_kg = mass_g / 1000
            ixx, iyy, izz = _box_inertia(mass_kg, tuple(dimensions))
            lines.extend(
                [
                    "    <inertial>",
                    '      <origin xyz="0 0 0" rpy="0 0 0" />',
                    f'      <mass value="{mass_kg:.6g}" />',
                    f'      <inertia ixx="{ixx:.9g}" ixy="0" ixz="0" iyy="{iyy:.9g}" iyz="0" izz="{izz:.9g}" />',
                    "    </inertial>",
                ]
            )
        if dimensions:
            size = _meters(tuple(dimensions))
            for kind in ("visual", "collision"):
                lines.extend(
                    [
                        f"    <{kind}>",
                        '      <origin xyz="0 0 0" rpy="0 0 0" />',
                        f'      <geometry><box size="{size}" /></geometry>',
                        f"    </{kind}>",
                    ]
                )
        lines.append("  </link>")

    for item in manifest["components"]:
        link = f"{_identifier(item['instance_id'])}_link"
        parent = item["parent_frame"] or "base_link"
        origin = tuple(item["position_mm"] or (0.0, 0.0, 0.0))
        rpy = tuple(item["rotation_rpy_deg"] or (0.0, 0.0, 0.0))
        joint = JointSpec.model_validate(item["joint"]) if item["joint"] else None
        lines.extend(_joint_xml(joint, parent=parent, child=link, origin_mm=origin, rpy_deg=rpy))

    lines.append("</robot>")
    return "\n".join(lines) + "\n"


def export_design(assembly: HardwareAssembly, *, robot_name: str = "desktop_robot") -> DesignExport:
    return DesignExport(
        manifest=build_design_manifest(assembly, robot_name=robot_name),
        urdf=export_urdf(assembly, robot_name=robot_name),
    )
