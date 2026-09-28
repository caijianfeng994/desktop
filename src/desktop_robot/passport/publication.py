from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel

from desktop_robot.hardware.catalog import board_to_dict, component_to_dict, get_catalog
from desktop_robot.hardware.compatibility import validate_assembly
from desktop_robot.passport.types import Passport
from desktop_robot.skills.catalog import CATALOG


class PublicationNotFound(FileNotFoundError):
    pass


class PublicationConflict(ValueError):
    pass


class RobotPublication(BaseModel):
    publication_id: str
    robot_id: str
    robot_name: str
    status: Literal["pending", "in_progress"] = "pending"
    claimant_name: str | None = None
    created_at: str
    claimed_at: str | None = None
    passport: dict[str, Any]
    hardware: dict[str, Any]
    software: dict[str, Any]


_LOCK = threading.RLock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def publication_dir(data_root: Path) -> Path:
    return data_root / "publications"


def _canonical_id(publication_id: str) -> str:
    try:
        return str(uuid.UUID(publication_id))
    except (ValueError, AttributeError) as exc:
        raise PublicationNotFound(publication_id) from exc


def publication_path(data_root: Path, publication_id: str) -> Path:
    return publication_dir(data_root) / f"{_canonical_id(publication_id)}.json"


def _write(data_root: Path, publication: RobotPublication) -> None:
    path = publication_path(data_root, publication.publication_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".json.tmp")
    temp.write_text(publication.model_dump_json(indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(path)


def load_publication(data_root: Path, publication_id: str) -> RobotPublication:
    path = publication_path(data_root, publication_id)
    if not path.is_file():
        raise PublicationNotFound(publication_id)
    try:
        return RobotPublication.model_validate_json(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        raise PublicationNotFound(publication_id) from exc


def _hardware_snapshot(passport: Passport) -> dict[str, Any]:
    assembly = passport.hardware
    if assembly is None:
        return {
            "board": None,
            "components": [],
            "capabilities": list(passport.hardware_capabilities),
            "totals": {},
            "connections": [],
        }
    boards, components = get_catalog(assembly)
    board = boards.get(assembly.board_id)
    mounted: list[dict[str, Any]] = []
    for item in assembly.components:
        card = components.get(item.component_id)
        mounted.append(
            {
                "instance_id": item.instance_id,
                "slot_id": item.slot_id,
                "connections": [connection.model_dump() for connection in item.connections],
                "component": component_to_dict(card) if card else {"id": item.component_id, "name": item.component_id},
            }
        )
    validation = validate_assembly(assembly)
    return {
        "board": board_to_dict(board) if board else {"id": assembly.board_id, "name": assembly.board_id},
        "components": mounted,
        "capabilities": list(passport.hardware_capabilities),
        "totals": validation.totals,
        "connections": [connection.model_dump() for connection in validation.connections],
    }


def _software_snapshot(passport: Passport) -> dict[str, Any]:
    skills: list[dict[str, Any]] = []
    for skill_id in passport.installed_skill_ids:
        card = CATALOG.get(skill_id)
        skills.append(
            {
                "id": skill_id,
                "name": card.name if card else skill_id,
                "summary": card.summary if card else "",
                "effect_device": card.effect_device if card else "",
            }
        )
    return {
        "skills": skills,
        "custom_skill": passport.custom_skill.model_dump() if passport.custom_skill else None,
        "persona_id": passport.persona_id,
    }


def _summary(publication: RobotPublication) -> dict[str, Any]:
    return {
        "publication_id": publication.publication_id,
        "robot_id": publication.robot_id,
        "robot_name": publication.robot_name,
        "status": publication.status,
        "claimant_name": publication.claimant_name,
        "created_at": publication.created_at,
        "claimed_at": publication.claimed_at,
        "board_name": (publication.hardware.get("board") or {}).get("name", "虚拟 Body"),
        "component_count": len(publication.hardware.get("components") or []),
        "skill_count": len(publication.software.get("skills") or []),
    }


def list_publications(data_root: Path) -> list[dict[str, Any]]:
    root = publication_dir(data_root)
    if not root.is_dir():
        return []
    publications: list[RobotPublication] = []
    for path in root.glob("*.json"):
        try:
            publications.append(RobotPublication.model_validate_json(path.read_text(encoding="utf-8")))
        except (ValueError, OSError):
            continue
    publications.sort(key=lambda item: item.created_at, reverse=True)
    return [_summary(item) for item in publications]


def publish_robot(data_root: Path, passport: Passport) -> RobotPublication:
    with _LOCK:
        for summary in list_publications(data_root):
            if summary["robot_id"] == passport.robot_id:
                return load_publication(data_root, summary["publication_id"])
        publication = RobotPublication(
            publication_id=str(uuid.uuid4()),
            robot_id=passport.robot_id,
            robot_name=passport.name,
            created_at=_now(),
            passport=passport.model_dump(mode="json"),
            hardware=_hardware_snapshot(passport),
            software=_software_snapshot(passport),
        )
        _write(data_root, publication)
        return publication


def claim_publication(data_root: Path, publication_id: str, claimant_name: str) -> RobotPublication:
    name = claimant_name.strip()
    if not name:
        raise ValueError("请填写领取人姓名")
    if len(name) > 32:
        raise ValueError("领取人姓名最长 32 字")
    with _LOCK:
        publication = load_publication(data_root, publication_id)
        if publication.status == "in_progress":
            if publication.claimant_name == name:
                return publication
            raise PublicationConflict(f"该机器人已被 {publication.claimant_name or '其他人'} 领取")
        publication.status = "in_progress"
        publication.claimant_name = name
        publication.claimed_at = _now()
        _write(data_root, publication)
        return publication
