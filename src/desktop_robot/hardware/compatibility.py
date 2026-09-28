from __future__ import annotations

from desktop_robot.hardware.catalog import get_catalog
from desktop_robot.hardware.types import AssemblyValidation, HardwareAssembly, IssueAction, ValidationIssue
from desktop_robot.hardware.wiring import auto_wire, effective_port_capacity, port_demand


def _action(
    type_: str,
    label: str,
    target_id: str | None = None,
    source_instance_id: str | None = None,
) -> IssueAction:
    return IssueAction(
        type=type_,  # type: ignore[arg-type]
        label=label,
        target_id=target_id,
        source_instance_id=source_instance_id,
    )


def _remove_action(instance_id: str) -> IssueAction:
    return _action("remove_component", "删除这个配件", source_instance_id=instance_id)


def _linux_board_action() -> IssueAction:
    return _action("select_board", "换用 Orange Pi Zero 3", "board.orange-pi-zero-3")


def _high_power_action(current_instance_id: str | None) -> IssueAction:
    return _action(
        "replace_component",
        "换用 60W PD 电池与配电模块",
        "power.pd-distribution-60w",
        current_instance_id,
    )


def assembly_capabilities(assembly: HardwareAssembly) -> frozenset[str]:
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    out = set(board.capabilities if board else ())
    for mounted in assembly.components:
        card = components.get(mounted.component_id)
        if card:
            out.update(card.provides)
    return frozenset(out)


def validate_assembly(assembly: HardwareAssembly) -> AssemblyValidation:
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    issues: list[ValidationIssue] = []
    if board is None:
        issues.append(ValidationIssue(
            level="error",
            code="unknown_board",
            message="所选主控板不存在",
            actions=[_action("select_board", "选择 Raspberry Pi Zero 2 W", "board.pi-zero-2w")],
        ))
        return AssemblyValidation(
            valid=False,
            issues=issues,
            capabilities=[],
            totals={},
            port_usage={},
            blocking_count=1,
            guidance=["请先选择一个有效主控板。"],
        )

    seen_instances: set[str] = set()
    used_slots: dict[str, str] = {}
    used_physical_ports: dict[str, str] = {}
    power = board.base_power_w
    price = board.price_cny
    supply = 0.0
    board_caps = set(board.capabilities)

    for mounted in assembly.components:
        if mounted.instance_id in seen_instances:
            issues.append(ValidationIssue(
                level="error", code="duplicate_instance", message="配件实例 ID 重复",
                component_ids=[mounted.instance_id], actions=[_remove_action(mounted.instance_id)],
            ))
            continue
        seen_instances.add(mounted.instance_id)
        card = components.get(mounted.component_id)
        if card is None:
            issues.append(ValidationIssue(
                level="error", code="unknown_component", message=f"未知配件：{mounted.component_id}",
                component_ids=[mounted.instance_id], actions=[_remove_action(mounted.instance_id)],
            ))
            continue
        power += card.power_w
        price += card.price_cny
        supply = max(supply, card.power_output_w)
        missing = set(card.requires_board_capabilities) - board_caps
        if missing:
            actions = [_linux_board_action(), _remove_action(mounted.instance_id)]
            if mounted.component_id == "audio.usb-combo" and board.id == "board.esp32-s3":
                actions.insert(0, _action(
                    "replace_component", "换成 ESP32 I²S 音频", "audio.i2s-combo", mounted.instance_id
                ))
            issues.append(ValidationIssue(
                level="error", code="board_incompatible",
                message=f"{card.name} 需要主控能力：{'、'.join(sorted(missing))}",
                component_ids=[mounted.instance_id], actions=actions,
            ))
        if mounted.slot_id:
            if card.compatible_slots and mounted.slot_id not in card.compatible_slots:
                actions = [_remove_action(mounted.instance_id)]
                available_slot = next(
                    (slot for slot in card.compatible_slots if slot not in used_slots), None
                )
                if available_slot:
                    actions.insert(0, _action(
                        "move_component", "移到推荐槽位", available_slot, mounted.instance_id
                    ))
                issues.append(ValidationIssue(
                    level="error", code="slot_incompatible",
                    message=f"{card.name} 不能安装到 {mounted.slot_id}",
                    component_ids=[mounted.instance_id], actions=actions,
                ))
            if mounted.slot_id in used_slots:
                issues.append(ValidationIssue(
                    level="error", code="slot_conflict", message=f"安装槽 {mounted.slot_id} 已被占用",
                    component_ids=[used_slots[mounted.slot_id], mounted.instance_id],
                    actions=[_remove_action(mounted.instance_id)],
                ))
            else:
                used_slots[mounted.slot_id] = mounted.instance_id
        for connection in mounted.connections:
            if not connection.component_port.startswith(mounted.instance_id + ":"):
                issues.append(ValidationIssue(
                    level="error", code="invalid_connection_owner", message=f"{card.name} 的接线不属于当前配件",
                    component_ids=[mounted.instance_id], actions=[_action("auto_wire", "重新自动接线")],
                ))
            if connection.board_port in used_physical_ports:
                issues.append(ValidationIssue(
                    level="error", code="port_conflict", message=f"端口 {connection.board_port} 被重复使用",
                    component_ids=[used_physical_ports[connection.board_port], mounted.instance_id],
                    actions=[_action("auto_wire", "重新自动分配端口")],
                ))
            else:
                used_physical_ports[connection.board_port] = mounted.instance_id
            if f":{connection.kind.upper()}" not in connection.board_port:
                issues.append(ValidationIssue(
                    level="error", code="connection_kind_mismatch",
                    message=f"{connection.board_port} 与 {connection.kind.upper()} 类型不匹配",
                    component_ids=[mounted.instance_id], actions=[_action("auto_wire", "重新自动接线")],
                ))

    demand = port_demand(assembly)
    capacity = effective_port_capacity(assembly)
    for kind in sorted(set(demand) | set(capacity)):
        used, total = demand.get(kind, 0), capacity.get(kind, 0)
        if used > total:
            suggestion = {"pwm": ("io.pca9685", "添加 PCA9685，可扩展 16 路 PWM"), "usb": ("io.usb-hub", "添加 USB Hub，可扩展 3 个可用接口")}.get(kind)
            if kind == "usb" and board.ports.get("usb", 0) == 0:
                suggestion = None
            actions: list[IssueAction] = []
            if suggestion:
                actions.append(_action("add_component", suggestion[1], suggestion[0]))
            if board.id != "board.orange-pi-zero-3":
                actions.append(_linux_board_action())
            port_user = next(
                (
                    mounted.instance_id
                    for mounted in reversed(assembly.components)
                    if (components.get(mounted.component_id) is not None)
                    and components[mounted.component_id].requires_ports.get(kind, 0) > 0
                ),
                None,
            )
            if port_user:
                actions.append(_remove_action(port_user))
            issues.append(ValidationIssue(
                level="error", code=f"{kind}_exhausted",
                message=f"{kind.upper()} 接口不足：需要 {used}，可用 {total}",
                actions=actions,
                action="add_component" if suggestion else None,
                suggested_component_id=suggestion[0] if suggestion else None,
            ))

    caps = assembly_capabilities(assembly)
    if assembly.target_mode == "physical":
        for capability, label in (("audio.input", "麦克风"), ("audio.output", "扬声器"), ("power.supply", "电源")):
            if capability not in caps:
                suggested = {
                    "audio.input": "audio.i2s-combo" if board.id == "board.esp32-s3" else "audio.usb-combo",
                    "audio.output": "audio.i2s-combo" if board.id == "board.esp32-s3" else "audio.usb-combo",
                    "power.supply": (
                        "power.usb-15w" if power <= 15
                        else "power.usb-25w" if power <= 25
                        else "power.pd-distribution-60w"
                    ),
                }[capability]
                issues.append(ValidationIssue(
                    level="error", code=f"missing_{capability.replace('.', '_')}",
                    message=f"物理机器人缺少{label}",
                    actions=[_action("add_component", f"添加推荐{label}", suggested)],
                    action="add_component",
                    suggested_component_id=suggested,
                ))
    if board.brain_mode == "external":
        issues.append(ValidationIssue(
            level="warning", code="external_brain",
            message=f"{board.name} 需要电脑或手机运行 Brain；这不会阻止生成",
            actions=[_linux_board_action()],
        ))

    # 整机供电能力由独立电源/配电模块决定。主控板的额定输入功率不能当作
    # 整机所有外设与舵机的共同上限，否则即使使用独立电源轨也会被误判。
    allowed_power = supply
    if supply and power > allowed_power:
        current_power = next(
            (m.instance_id for m in assembly.components if components.get(m.component_id) and components[m.component_id].power_output_w > 0),
            None,
        )
        actions: list[IssueAction] = [_high_power_action(current_power)]
        removable = max(
            (
                (components[m.component_id].power_w, m.instance_id)
                for m in assembly.components
                if components.get(m.component_id)
                and components[m.component_id].power_w > 0
                and not any(cap.startswith("audio.") for cap in components[m.component_id].provides)
            ),
            default=None,
        )
        if removable:
            actions.append(_action("remove_component", "删除最高功耗的非必需配件", source_instance_id=removable[1]))
        actions.append(_action("accept_power_risk", "保留风险并继续创建"))
        issues.append(ValidationIssue(
            level="warning" if assembly.allow_power_override else "error",
            code="power_overload_accepted" if assembly.allow_power_override else "power_overload",
            message=(
                f"峰值功耗 {power:.1f}W，超过可用 {allowed_power:.1f}W；已允许继续创建，实际通电前必须升级供电"
                if assembly.allow_power_override
                else f"峰值功耗 {power:.1f}W，超过可用 {allowed_power:.1f}W"
            ),
            actions=actions,
        ))
    if any("motion.servo" in c for c in caps) and supply and supply - power < 2:
        current_power = next(
            (m.instance_id for m in assembly.components if components.get(m.component_id) and components[m.component_id].power_output_w > 0),
            None,
        )
        issues.append(ValidationIssue(
            level="warning", code="servo_power_margin",
            message="舵机余量不足 2W；这不会阻止生成，但建议提升供电",
            actions=[_high_power_action(current_power)],
        ))

    port_usage = {kind: {"used": demand.get(kind, 0), "capacity": capacity.get(kind, 0)} for kind in sorted(set(demand) | set(capacity))}
    connections = auto_wire(assembly)
    blocking_count = sum(i.level == "error" for i in issues)
    valid = blocking_count == 0
    guidance = (
        ["兼容性已经通过，可以进入接线并创建机器人。"]
        if valid
        else [
            f"还需处理 {blocking_count} 个红色问题才能创建机器人。",
            "每条问题都可以选择推荐修复，也可以删除对应配件。",
        ]
    )
    return AssemblyValidation(
        valid=valid,
        issues=issues,
        capabilities=sorted(caps),
        totals={"price_cny": price, "power_w": round(power, 2), "power_capacity_w": allowed_power, "board": board.name},
        port_usage=port_usage,
        connections=connections,
        blocking_count=blocking_count,
        guidance=guidance,
    )
