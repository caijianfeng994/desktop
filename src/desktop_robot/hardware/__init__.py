from desktop_robot.hardware.catalog import board_to_dict, component_to_dict, get_catalog
from desktop_robot.hardware.compatibility import assembly_capabilities, validate_assembly
from desktop_robot.hardware.types import HardwareAssembly, MountedComponent, PortConnection
from desktop_robot.hardware.wiring import auto_wire

__all__ = [
    "HardwareAssembly",
    "MountedComponent",
    "PortConnection",
    "assembly_capabilities",
    "auto_wire",
    "board_to_dict",
    "component_to_dict",
    "get_catalog",
    "validate_assembly",
]
