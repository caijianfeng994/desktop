from __future__ import annotations

from desktop_robot.hardware.catalog import ComponentCard, get_catalog
from desktop_robot.hardware.types import HardwareAssembly, PortConnection


def effective_port_capacity(assembly: HardwareAssembly) -> dict[str, int]:
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    if board is None:
        return {}
    capacity = dict(board.ports)
    # Hub consumes one upstream USB but provides four downstream sockets: net +3.
    for mounted in assembly.components:
        card = components.get(mounted.component_id)
        if card and "io.usb_hub" in card.provides and board.ports.get("usb", 0) > 0:
            capacity["usb"] = capacity.get("usb", 0) + 3
        if card and "io.pwm_expander" in card.provides:
            capacity["pwm"] = capacity.get("pwm", 0) + 16
    return capacity


def port_demand(assembly: HardwareAssembly) -> dict[str, int]:
    _, components = get_catalog(assembly)
    demand: dict[str, int] = {}
    for mounted in assembly.components:
        card = components.get(mounted.component_id)
        if card is None:
            continue
        for kind, count in card.requires_ports.items():
            demand[kind] = demand.get(kind, 0) + count
    return demand


def auto_wire(assembly: HardwareAssembly) -> list[PortConnection]:
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    if board is None:
        return []
    capacity = effective_port_capacity(assembly)
    used: dict[str, int] = {}
    output: list[PortConnection] = []
    pwm_expanders = [
        mounted
        for mounted in assembly.components
        if (components.get(mounted.component_id) is not None)
        and "io.pwm_expander" in components[mounted.component_id].provides
    ]
    for mounted in assembly.components:
        card: ComponentCard | None = components.get(mounted.component_id)
        if card is None:
            continue
        for kind, count in card.requires_ports.items():
            for local_index in range(count):
                number = used.get(kind, 0) + 1
                used[kind] = number
                if number > capacity.get(kind, 0):
                    continue
                target_port = f"{board.id}:{kind.upper()}{number}"
                if kind == "pwm" and number > board.ports.get("pwm", 0):
                    expanded_index = number - board.ports.get("pwm", 0) - 1
                    expander_index, channel_index = divmod(expanded_index, 16)
                    if expander_index < len(pwm_expanders):
                        target_port = f"{pwm_expanders[expander_index].instance_id}:PWM{channel_index + 1}"
                output.append(
                    PortConnection(
                        component_port=f"{mounted.instance_id}:{kind}{local_index + 1}",
                        board_port=target_port,
                        kind=kind,
                    )
                )
    return output
