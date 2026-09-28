from __future__ import annotations

import re
import uuid
from pathlib import Path

from desktop_robot.passport.store import init_memory, save_passport
from desktop_robot.passport.types import CustomSkill, Passport
from desktop_robot.hardware.compatibility import assembly_capabilities, validate_assembly
from desktop_robot.hardware.types import HardwareAssembly
from desktop_robot.skills.catalog import (
    CATALOG,
    CHAT_GATE_ID,
    DEFAULT_PACK,
    MAX_INSTALLED,
    persona_ids,
)

_REJECT = re.compile(
    r"(忽略以上|ignore\s+(all\s+)?previous|系统提示|system\s*prompt|"
    r"执行命令|rm\s+-rf|os\.system|subprocess|/bin/sh)",
    re.IGNORECASE,
)


class GenerateError(ValueError):
    pass


def _check_custom(custom: CustomSkill | None) -> None:
    if custom is None:
        return
    blob = f"{custom.name} {custom.summary} {custom.trigger} {custom.effect}"
    if _REJECT.search(blob):
        raise GenerateError("自制技能内容不安全，请修改后再试")


def _validate_skills(skill_ids: list[str], *, allow_custom_slot: bool) -> None:
    for sid in skill_ids:
        if sid not in CATALOG:
            raise GenerateError(f"未知技能: {sid}")
    personas = persona_ids(skill_ids)
    if len(personas) > 1:
        raise GenerateError("官方人设包最多安装 1 个")
    total = len(skill_ids) + (1 if allow_custom_slot else 0)
    if total > MAX_INSTALLED:
        raise GenerateError(f"已安装技能不能超过 {MAX_INSTALLED} 个")


def generate_robot(
    *,
    data_root: Path,
    name: str,
    route: str,
    skill_ids: list[str] | None = None,
    custom_skill: CustomSkill | None = None,
    call_me: str | None = None,
    prefer_extra: str | None = None,
    appearance_kind: str = "geometric",
    hardware: HardwareAssembly | dict | None = None,
) -> Passport:
    name = name.strip()
    if not name:
        raise GenerateError("名字不能为空")
    if len(name) > 16:
        raise GenerateError("名字最长 16 字")

    if route == "default":
        installed = list(DEFAULT_PACK)
        custom_skill = None
    elif route == "custom":
        installed = list(dict.fromkeys(skill_ids or []))
        _check_custom(custom_skill)
        _validate_skills(installed, allow_custom_slot=custom_skill is not None)
    else:
        raise GenerateError("路线必须是 default 或 custom")

    status = "ready" if CHAT_GATE_ID in installed else "draft"
    personas = persona_ids(installed)
    persona_id = personas[0] if personas else None

    facts_seed: dict[str, str] = {}
    if "memory.owner" in installed or route == "default":
        facts_seed["user.call_me"] = (call_me or name).strip()[:32]
        if prefer_extra and prefer_extra.strip():
            facts_seed["prefer.extra"] = prefer_extra.strip()[:80]

    if appearance_kind not in ("geometric", "glb"):
        raise GenerateError("形象类型无效")

    assembly: HardwareAssembly | None = None
    hardware_capabilities: list[str] = []
    body_kind = "fake"
    if hardware is not None:
        try:
            assembly = hardware if isinstance(hardware, HardwareAssembly) else HardwareAssembly.model_validate(hardware)
        except Exception as e:  # noqa: BLE001
            raise GenerateError(f"硬件装配数据无效：{e}") from e
        validation = validate_assembly(assembly)
        if not validation.valid:
            reasons = "；".join(i.message for i in validation.issues if i.level == "error")
            raise GenerateError(f"硬件装配未通过校验：{reasons}")
        hardware_capabilities = sorted(assembly_capabilities(assembly))
        missing_by_skill: list[str] = []
        caps = set(hardware_capabilities)
        for sid in installed:
            card = CATALOG[sid]
            missing = set(card.requires_hardware) - caps
            if missing:
                missing_by_skill.append(f"{card.name}缺少{'/'.join(sorted(missing))}")
        if missing_by_skill:
            raise GenerateError("技能与硬件不匹配：" + "；".join(missing_by_skill))
        if assembly.board_id == "board.esp32-s3":
            body_kind = "esp32"
        else:
            body_kind = "linux"

    robot_id = str(uuid.uuid4())
    passport = Passport(
        robot_id=robot_id,
        name=name,
        route=route,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        installed_skill_ids=installed,
        custom_skill=custom_skill,
        persona_id=persona_id,
        facts_seed=facts_seed,
        appearance_kind=appearance_kind,  # type: ignore[arg-type]
        hardware=assembly,
        hardware_capabilities=hardware_capabilities,
        body=body_kind,  # type: ignore[arg-type]
    )
    save_passport(data_root, passport)
    init_memory(data_root, passport)
    return passport
