from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PortConnection(BaseModel):
    component_port: str
    board_port: str
    kind: str


class PhysicalSpec(BaseModel):
    """Engineering metadata used by CAD/URDF handoffs, independent of the UI layout."""

    dimensions_mm: tuple[float, float, float] | None = None
    mass_g: float | None = Field(default=None, gt=0)
    cad_query: str | None = None
    cad_source_url: str | None = None
    step_path: str | None = None
    mesh_path: str | None = None
    mesh_units: Literal["mm", "m"] = "mm"
    source: str = "unspecified"
    confidence: Literal["exact", "estimated", "placeholder", "unknown"] = "unknown"


class JointSpec(BaseModel):
    """Explicit kinematic facts; values are converted to SI only at URDF export."""

    name: str
    type: Literal["fixed", "revolute", "continuous", "prismatic"] = "fixed"
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0)
    lower: float | None = None
    upper: float | None = None
    effort: float = Field(default=1.0, gt=0)
    velocity: float = Field(default=1.0, gt=0)
    positive_motion: str = "unspecified"
    source: str = "user"


class MountedComponent(BaseModel):
    instance_id: str
    component_id: str
    slot_id: str | None = None
    x: float = Field(default=50.0, ge=0, le=100)
    y: float = Field(default=50.0, ge=0, le=100)
    z: float = Field(default=0.0, ge=-100, le=100)
    rotation: float = Field(default=0.0, ge=-360, le=360)
    scale: float = Field(default=1.0, ge=0.25, le=4.0)
    parent_frame: str = "base_link"
    position_mm: tuple[float, float, float] | None = None
    rotation_rpy_deg: tuple[float, float, float] | None = None
    joint: JointSpec | None = None
    physical_override: PhysicalSpec | None = None
    connections: list[PortConnection] = Field(default_factory=list)


class CustomBoard(BaseModel):
    id: str = Field(pattern=r"^custom\.[a-zA-Z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=48)
    price_cny: int = Field(default=0, ge=0, le=100000)
    base_power_w: float = Field(default=2, ge=0, le=1000)
    power_limit_w: float = Field(default=15, gt=0, le=5000)
    ports: dict[str, int] = Field(default_factory=dict)
    capabilities: list[str] = Field(default_factory=list)
    brain_mode: Literal["local", "external"] = "local"
    physical: PhysicalSpec = Field(default_factory=PhysicalSpec)


class CustomComponent(BaseModel):
    id: str = Field(pattern=r"^custom\.[a-zA-Z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=48)
    category: str = Field(default="other", max_length=32)
    price_cny: int = Field(default=0, ge=0, le=100000)
    power_w: float = Field(default=0, ge=0, le=1000)
    requires_ports: dict[str, int] = Field(default_factory=dict)
    provides: list[str] = Field(default_factory=list)
    compatible_slots: list[str] = Field(default_factory=list)
    requires_board_capabilities: list[str] = Field(default_factory=list)
    power_output_w: float = Field(default=0, ge=0, le=5000)
    physical: PhysicalSpec = Field(default_factory=PhysicalSpec)


class HardwareAssembly(BaseModel):
    target_mode: Literal["physical", "web_preview"] = "physical"
    board_id: str
    board_physical_override: PhysicalSpec | None = None
    components: list[MountedComponent] = Field(default_factory=list)
    custom_boards: list[CustomBoard] = Field(default_factory=list)
    custom_components: list[CustomComponent] = Field(default_factory=list)
    view_mode: Literal["front", "back", "three_d"] = "front"
    validation_rev: int = 3
    allow_power_override: bool = False


class IssueAction(BaseModel):
    type: Literal[
        "add_component",
        "remove_component",
        "replace_component",
        "select_board",
        "move_component",
        "auto_wire",
        "accept_power_risk",
    ]
    label: str
    target_id: str | None = None
    source_instance_id: str | None = None


class ValidationIssue(BaseModel):
    level: Literal["error", "warning", "suggestion"]
    code: str
    message: str
    component_ids: list[str] = Field(default_factory=list)
    action: Literal["add_component"] | None = None
    suggested_component_id: str | None = None
    actions: list[IssueAction] = Field(default_factory=list)


class AssemblyValidation(BaseModel):
    valid: bool
    issues: list[ValidationIssue]
    capabilities: list[str]
    totals: dict[str, float | int | str]
    port_usage: dict[str, dict[str, int]]
    connections: list[PortConnection] = Field(default_factory=list)
    blocking_count: int = 0
    guidance: list[str] = Field(default_factory=list)
