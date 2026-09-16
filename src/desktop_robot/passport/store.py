from __future__ import annotations

import json
from pathlib import Path

from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.types import Passport


def robot_dir(data_root: Path, robot_id: str) -> Path:
    return data_root / "robots" / robot_id


def passport_path(data_root: Path, robot_id: str) -> Path:
    return robot_dir(data_root, robot_id) / "passport.json"


def db_path(data_root: Path, robot_id: str) -> Path:
    return robot_dir(data_root, robot_id) / "robot.db"


def avatar_glb_path(data_root: Path, robot_id: str) -> Path:
    return robot_dir(data_root, robot_id) / "avatar.glb"


def draft_dir(data_root: Path) -> Path:
    return data_root / "assembly-drafts"


def merge_assembly_draft(existing: dict, incoming: dict) -> dict:
    merged = dict(existing)
    merged.update({key: value for key, value in incoming.items() if key != "assembly"})
    if "assembly" not in incoming:
        return merged

    old_assembly = existing.get("assembly")
    new_assembly = incoming["assembly"]
    if not isinstance(old_assembly, dict) or not isinstance(new_assembly, dict):
        merged["assembly"] = new_assembly
        return merged

    assembly = dict(old_assembly)
    assembly.update({key: value for key, value in new_assembly.items() if key != "components"})
    old_components = {
        item.get("instance_id"): item
        for item in old_assembly.get("components", [])
        if isinstance(item, dict) and item.get("instance_id")
    }
    components = []
    for item in new_assembly.get("components", []):
        if not isinstance(item, dict):
            continue
        component = dict(old_components.get(item.get("instance_id"), {}))
        # 入站组件经过 pydantic 归一化，未填写的工程字段会变成显式 None；此处按“未提供”处理。
        component.update(
            {
                key: value
                for key, value in item.items()
                if value is not None or key not in component
            }
        )
        components.append(component)
    assembly["components"] = components
    merged["assembly"] = assembly
    return merged


def save_assembly_draft(
    data_root: Path,
    draft_id: str,
    payload: dict,
    *,
    merge_existing: bool = False,
) -> Path:
    path = draft_dir(data_root) / f"{draft_id}.json"
    if merge_existing and path.is_file():
        payload = merge_assembly_draft(load_assembly_draft(data_root, draft_id), payload)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def load_assembly_draft(data_root: Path, draft_id: str) -> dict:
    path = draft_dir(data_root) / f"{draft_id}.json"
    if not path.is_file():
        raise FileNotFoundError(draft_id)
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("draft invalid")
    return raw


def save_avatar_glb(data_root: Path, robot_id: str, glb: bytes) -> Path:
    path = avatar_glb_path(data_root, robot_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb)
    return path


def save_passport(data_root: Path, passport: Passport) -> Path:
    d = robot_dir(data_root, passport.robot_id)
    d.mkdir(parents=True, exist_ok=True)
    path = passport_path(data_root, passport.robot_id)
    path.write_text(
        passport.model_dump_json(indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def load_passport(path: Path) -> Passport:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return Passport.model_validate(raw)


def init_memory(data_root: Path, passport: Passport) -> Path:
    db = db_path(data_root, passport.robot_id)
    db.parent.mkdir(parents=True, exist_ok=True)
    store = MemoryStore(str(db))
    for key, value in passport.facts_seed.items():
        store.set_fact(key, value, source="passport_seed")
    return db
