from __future__ import annotations

import base64
import json
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from desktop_robot.llm.openai_compat import load_dotenv
from desktop_robot.hardware.catalog import SLOTS, board_to_dict, component_to_dict, get_catalog
from desktop_robot.hardware.compatibility import validate_assembly
from desktop_robot.hardware.design_export import export_design
from desktop_robot.hardware.types import HardwareAssembly
from desktop_robot.hardware.wiring import auto_wire
from desktop_robot.passport.generate import GenerateError, generate_robot
from desktop_robot.passport.publication import (
    PublicationConflict,
    PublicationNotFound,
    claim_publication,
    list_publications,
    load_publication,
    publish_robot,
)
from desktop_robot.passport.store import (
    avatar_glb_path,
    load_assembly_draft,
    load_passport,
    passport_path,
    save_assembly_draft,
    save_avatar_glb,
    save_passport,
)
from desktop_robot.passport.types import CustomSkill
from desktop_robot.studio.glb_inspect import GlbError, inspect_glb
from desktop_robot.studio.image_to_3d import ImageTo3DError, image_bytes_to_glb, validate_image_bytes
from desktop_robot.studio.make_it_animatable import MakeItAnimatableError, rig_glb_bytes
from desktop_robot.studio.sessions import SessionRegistry

STATIC_DIR = Path(__file__).resolve().parent / "static"
DEFAULT_DATA_ROOT = Path("./data")
_ROBOT_ID_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
)
_ROBOT_MESH_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/avatar\.glb$"
)
_ROBOT_AVATAR_UPLOAD_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/avatar$"
)
_ROBOT_AUTO_RIG_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/auto-rig$"
)
_ASSEMBLY_DRAFT_RE = re.compile(r"^/api/assembly/draft/([0-9a-fA-F-]{36})$")
_ROBOT_PUBLISH_RE = re.compile(
    r"^/api/robot/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/publish$"
)
_PUBLICATION_RE = re.compile(r"^/api/publications/([0-9a-fA-F-]{36})$")
_PUBLICATION_CLAIM_RE = re.compile(r"^/api/publications/([0-9a-fA-F-]{36})/claim$")


class StudioHandler(BaseHTTPRequestHandler):
    data_root: Path = DEFAULT_DATA_ROOT
    registry: SessionRegistry | None = None
    convert_avatar: Callable[[bytes], bytes] = staticmethod(image_bytes_to_glb)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[studio] {self.address_string()} {format % args}")

    def _reg(self) -> SessionRegistry:
        assert self.registry is not None
        return self.registry

    def _write(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, obj: dict[str, Any]) -> None:
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self._write(status, data, "application/json; charset=utf-8")

    def _read_json(self) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
            if not isinstance(payload, dict):
                raise ValueError("not object")
            return payload
        except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
            return None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/", "/index.html"):
            self._write(200, (STATIC_DIR / "index.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path in ("/robot.html", "/robot"):
            self._write(200, (STATIC_DIR / "robot.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path in ("/publish.html", "/publish"):
            self._write(200, (STATIC_DIR / "publish.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path in ("/publish-detail.html", "/publish-detail"):
            self._write(200, (STATIC_DIR / "publish-detail.html").read_bytes(), "text/html; charset=utf-8")
            return
        if path == "/robot-avatar.png":
            png = STATIC_DIR / "robot-avatar.png"
            if png.is_file():
                self._write(200, png.read_bytes(), "image/png")
                return
        if path in ("/robot-avatar-3d.png", "/robot-avatar-depth.png"):
            png = STATIC_DIR / path.lstrip("/")
            if png.is_file():
                self._write(200, png.read_bytes(), "image/png")
                return
        mesh = _ROBOT_MESH_RE.match(path)
        if mesh:
            robot_id = mesh.group(1)
            glb = avatar_glb_path(self.data_root, robot_id)
            if glb.is_file():
                self._write(200, glb.read_bytes(), "model/gltf-binary")
                return
            self._json(404, {"ok": False, "reason": "没有 3D 模型"})
            return
        if path == "/api/catalog":
            from desktop_robot.skills.catalog import (
                DEFAULT_PACK,
                MAX_INSTALLED,
                card_to_dict,
                list_online,
                list_official,
            )

            self._json(
                200,
                {
                    "ok": True,
                    "default_pack": list(DEFAULT_PACK),
                    "max_installed": MAX_INSTALLED,
                    "official": [card_to_dict(c) for c in list_official()],
                    "online": [card_to_dict(c) for c in list_online()],
                    "skills": [card_to_dict(c) for c in list_official()]
                    + [card_to_dict(c) for c in list_online()],
                },
            )
            return
        if path == "/api/hardware/catalog":
            boards, components = get_catalog()
            self._json(
                200,
                {
                    "ok": True,
                    "boards": [board_to_dict(c) for c in boards.values()],
                    "components": [component_to_dict(c) for c in components.values()],
                    "slots": SLOTS,
                },
            )
            return
        if path == "/api/publications":
            self._json(200, {"ok": True, "publications": list_publications(self.data_root)})
            return
        publication = _PUBLICATION_RE.match(path)
        if publication:
            try:
                item = load_publication(self.data_root, publication.group(1))
            except PublicationNotFound:
                self._json(404, {"ok": False, "reason": "发布单不存在"})
                return
            self._json(200, {"ok": True, "publication": item.model_dump()})
            return
        draft = _ASSEMBLY_DRAFT_RE.match(path)
        if draft:
            try:
                saved = load_assembly_draft(self.data_root, draft.group(1))
            except (FileNotFoundError, ValueError):
                self._json(404, {"ok": False, "reason": "装配草稿不存在"})
                return
            self._json(200, {"ok": True, "draft_id": draft.group(1), "data": saved})
            return
        m = _ROBOT_ID_RE.match(path)
        if m:
            robot_id = m.group(1)
            try:
                passport = self._reg().get_passport(robot_id)
            except FileNotFoundError:
                self._json(404, {"ok": False, "reason": "机器人不存在"})
                return
            self._json(200, {"ok": True, "passport": passport.model_dump()})
            return
        self._json(404, {"ok": False, "reason": "not_found"})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json()
        if payload is None:
            self._json(400, {"ok": False, "reason": "invalid_json"})
            return

        if path == "/api/generate":
            self._handle_generate(payload)
            return
        if path == "/api/assembly/validate":
            self._handle_assembly_validate(payload)
            return
        if path == "/api/assembly/auto-wire":
            self._handle_auto_wire(payload)
            return
        if path == "/api/assembly/design-export":
            self._handle_design_export(payload)
            return
        if path == "/api/assembly/save":
            self._handle_assembly_save(payload)
            return
        publish = _ROBOT_PUBLISH_RE.match(path)
        if publish:
            self._handle_publish(publish.group(1))
            return
        claim = _PUBLICATION_CLAIM_RE.match(path)
        if claim:
            self._handle_publication_claim(claim.group(1), payload)
            return
        up = _ROBOT_AVATAR_UPLOAD_RE.match(path)
        if up:
            self._handle_avatar_upload(up.group(1), payload)
            return
        ar = _ROBOT_AUTO_RIG_RE.match(path)
        if ar:
            self._handle_auto_rig(ar.group(1), payload)
            return
        if path == "/api/chat":
            self._handle_chat(payload)
            return
        if path == "/api/idle":
            self._handle_idle(payload)
            return
        self._json(404, {"ok": False, "reason": "not_found"})

    def _handle_publish(self, robot_id: str) -> None:
        try:
            passport = self._reg().get_passport(robot_id)
        except FileNotFoundError:
            self._json(404, {"ok": False, "reason": "机器人不存在"})
            return
        publication = publish_robot(self.data_root, passport)
        self._json(
            200,
            {
                "ok": True,
                "publication": publication.model_dump(),
                "publication_url": f"/publish.html?published={publication.publication_id}",
            },
        )

    def _handle_publication_claim(self, publication_id: str, payload: dict[str, Any]) -> None:
        try:
            publication = claim_publication(
                self.data_root,
                publication_id,
                str(payload.get("claimant_name") or ""),
            )
        except PublicationNotFound:
            self._json(404, {"ok": False, "reason": "发布单不存在"})
            return
        except PublicationConflict as exc:
            self._json(409, {"ok": False, "reason": str(exc)})
            return
        except ValueError as exc:
            self._json(400, {"ok": False, "reason": str(exc)})
            return
        self._json(200, {"ok": True, "publication": publication.model_dump()})

    def _assembly_from_payload(self, payload: dict[str, Any]) -> HardwareAssembly | None:
        raw = payload.get("assembly", payload)
        try:
            return HardwareAssembly.model_validate(raw)
        except Exception as e:  # noqa: BLE001
            self._json(400, {"ok": False, "reason": f"装配数据无效：{e}"})
            return None

    def _handle_assembly_validate(self, payload: dict[str, Any]) -> None:
        assembly = self._assembly_from_payload(payload)
        if assembly is None:
            return
        result = validate_assembly(assembly)
        self._json(200, {"ok": True, "validation": result.model_dump()})

    def _handle_auto_wire(self, payload: dict[str, Any]) -> None:
        assembly = self._assembly_from_payload(payload)
        if assembly is None:
            return
        validation = validate_assembly(assembly)
        connections = auto_wire(assembly)
        by_instance: dict[str, list[dict]] = {}
        for conn in connections:
            instance_id = conn.component_port.split(":", 1)[0]
            by_instance.setdefault(instance_id, []).append(conn.model_dump())
        wired = assembly.model_dump()
        for mounted in wired["components"]:
            mounted["connections"] = by_instance.get(mounted["instance_id"], [])
        self._json(
            200,
            {
                "ok": True,
                "assembly": wired,
                "connections": [c.model_dump() for c in connections],
                "validation": validation.model_dump(),
            },
        )

    def _handle_design_export(self, payload: dict[str, Any]) -> None:
        assembly = self._assembly_from_payload(payload)
        if assembly is None:
            return
        try:
            result = export_design(
                assembly,
                robot_name=str(payload.get("robot_name") or "desktop_robot"),
            )
        except ValueError as exc:
            self._json(400, {"ok": False, "reason": str(exc)})
            return
        self._json(
            200,
            {
                "ok": True,
                "manifest": result.manifest,
                "urdf": result.urdf,
                "provisional": result.manifest["status"] != "ready",
            },
        )

    def _handle_assembly_save(self, payload: dict[str, Any]) -> None:
        assembly = self._assembly_from_payload(payload)
        if assembly is None:
            return
        draft_id = str(payload.get("draft_id") or uuid.uuid4())
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", draft_id):
            self._json(400, {"ok": False, "reason": "draft_id 无效"})
            return
        saved = dict(payload)
        # 只落盘客户端真正提交过的字段，未提交字段不参与合并，避免覆盖另一轨的工程数据。
        saved["assembly"] = assembly.model_dump(exclude_unset=True)
        save_assembly_draft(self.data_root, draft_id, saved, merge_existing=True)
        self._json(200, {"ok": True, "draft_id": draft_id})

    def _drop_session(self, robot_id: str) -> None:
        reg = self._reg()
        with reg._lock:
            reg._sessions.pop(robot_id, None)

    def _handle_auto_rig(self, robot_id: str, payload: dict[str, Any]) -> None:
        """后台调用 Make-It-Animatable Space：静态 GLB → 绑骨可动画 GLB。"""
        glb_path = avatar_glb_path(self.data_root, robot_id)
        if not glb_path.is_file():
            self._json(400, {"ok": False, "reason": "没有可绑骨的 avatar.glb（请先上传形象生成 3D）"})
            return
        try:
            path = passport_path(self.data_root, robot_id)
            passport = load_passport(path)
        except Exception:  # noqa: BLE001
            self._json(404, {"ok": False, "reason": "机器人不存在"})
            return

        raw = glb_path.read_bytes()
        # 已有骨骼动画则跳过
        try:
            before = inspect_glb(raw)
            if before.animatable and not payload.get("force"):
                self._json(
                    200,
                    {
                        "ok": True,
                        "skipped": True,
                        "hint": "当前 GLB 已有 skins+animations，无需再绑骨。可传 force=true 强制重跑。",
                        "has_skins": before.has_skins,
                        "animation_count": before.animation_count,
                        "animation_names": list(before.animation_names)[:20],
                    },
                )
                return
        except GlbError:
            pass

        try:
            rigged, info = rig_glb_bytes(raw)
        except MakeItAnimatableError as e:
            self._json(502, {"ok": False, "reason": str(e)})
            return

        # 备份原静态壳
        bak = glb_path.with_suffix(".glb.static.bak")
        if not bak.is_file():
            bak.write_bytes(raw)
        save_avatar_glb(self.data_root, robot_id, rigged)
        if passport.appearance_kind != "glb":
            passport.appearance_kind = "glb"
            save_passport(self.data_root, passport)
        self._drop_session(robot_id)
        self._json(
            200,
            {
                "ok": True,
                "skipped": False,
                "animatable": info.animatable,
                "has_skins": info.has_skins,
                "animation_count": info.animation_count,
                "animation_names": list(info.animation_names)[:20],
                "mesh_count": info.mesh_count,
                "byte_size": info.byte_size,
                "hint": (
                    "后台绑骨完成，刷新页面后将用 AnimationMixer 播放。"
                    if info.animatable
                    else "绑骨完成但未检测到动画片段；骨骼应已写入，可再手动上传含动作的 GLB。"
                ),
                "pipeline": {
                    "shape": "Trellis / Luxin",
                    "rig": "Make-It-Animatable (HF Space)",
                    "play": "Three.js AnimationMixer",
                },
            },
        )

    def _handle_avatar_upload(self, robot_id: str, payload: dict[str, Any]) -> None:
        """Trellis 出形后：回传 Mixamo / Make-It-Animatable 绑骨 GLB。"""
        try:
            path = passport_path(self.data_root, robot_id)
            if not path.is_file():
                raise FileNotFoundError(robot_id)
            passport = load_passport(path)
        except FileNotFoundError:
            self._json(404, {"ok": False, "reason": "机器人不存在"})
            return

        b64 = payload.get("glb_b64")
        if not isinstance(b64, str) or not b64.strip():
            self._json(400, {"ok": False, "reason": "缺少 glb_b64"})
            return
        try:
            raw = base64.b64decode(b64.strip(), validate=False)
        except Exception:  # noqa: BLE001
            self._json(400, {"ok": False, "reason": "GLB 编码无效"})
            return
        if len(raw) > 40 * 1024 * 1024:
            self._json(400, {"ok": False, "reason": "GLB 不能超过 40MB"})
            return
        try:
            info = inspect_glb(raw)
        except GlbError as e:
            self._json(400, {"ok": False, "reason": str(e)})
            return

        save_avatar_glb(self.data_root, robot_id, raw)
        if passport.appearance_kind != "glb":
            passport.appearance_kind = "glb"
            save_passport(self.data_root, passport)

        self._drop_session(robot_id)

        self._json(
            200,
            {
                "ok": True,
                "animatable": info.animatable,
                "has_skins": info.has_skins,
                "animation_count": info.animation_count,
                "animation_names": list(info.animation_names)[:20],
                "mesh_count": info.mesh_count,
                "byte_size": info.byte_size,
                "hint": (
                    "已写入带骨骼动画的 GLB，刷新后用 Mixer 播放。"
                    if info.animatable
                    else "已保存 GLB，但未检测到 skins+animations；请确认 Mixamo 导出勾选 With Skin 并至少含一段动画。"
                ),
                "pipeline": {
                    "shape": "Trellis / Luxin",
                    "rig": "Mixamo 或 Make-It-Animatable",
                    "play": "Three.js AnimationMixer",
                },
            },
        )

    def _decode_avatar(self, payload: dict[str, Any]) -> bytes | None:
        b64 = payload.get("avatar_image_b64")
        if not b64:
            return None
        if not isinstance(b64, str):
            raise ImageTo3DError("图片编码无效")
        try:
            return base64.b64decode(b64.strip(), validate=False)
        except Exception as e:
            raise ImageTo3DError("图片编码无效") from e

    def _handle_generate(self, payload: dict[str, Any]) -> None:
        custom = None
        cs = payload.get("custom_skill")
        if isinstance(cs, dict) and cs.get("name") and cs.get("summary"):
            try:
                custom = CustomSkill.model_validate(cs)
            except Exception as e:  # noqa: BLE001
                self._json(400, {"ok": False, "reason": str(e)})
                return

        glb_bytes: bytes | None = None
        try:
            image = self._decode_avatar(payload)
            if image is not None:
                validate_image_bytes(image)
                glb_bytes = self.convert_avatar(image)
        except ImageTo3DError as e:
            self._json(400, {"ok": False, "reason": str(e)})
            return

        try:
            passport = generate_robot(
                data_root=self.data_root,
                name=str(payload.get("name") or ""),
                route=str(payload.get("route") or ""),
                skill_ids=list(payload.get("skill_ids") or []),
                custom_skill=custom,
                call_me=payload.get("call_me"),
                prefer_extra=payload.get("prefer_extra"),
                appearance_kind="glb" if glb_bytes else "geometric",
                hardware=payload.get("assembly"),
            )
        except GenerateError as e:
            self._json(400, {"ok": False, "reason": str(e)})
            return

        if glb_bytes is not None:
            save_avatar_glb(self.data_root, passport.robot_id, glb_bytes)

        self._json(
            200,
            {
                "ok": True,
                "passport": passport.model_dump(),
                "robot_url": f"/robot.html?id={passport.robot_id}",
            },
        )

    def _handle_chat(self, payload: dict[str, Any]) -> None:
        robot_id = str(payload.get("robot_id") or "").strip()
        text = str(payload.get("text") or "").strip()
        if not robot_id or not text:
            self._json(400, {"ok": False, "reason": "缺少 robot_id 或 text"})
            return
        try:
            result = self._reg().chat(robot_id, text)
        except FileNotFoundError:
            self._json(404, {"ok": False, "reason": "机器人不存在"})
            return
        status = 200 if result.get("ok") else 400
        self._json(status, result)

    def _handle_idle(self, payload: dict[str, Any]) -> None:
        robot_id = str(payload.get("robot_id") or "").strip()
        if not robot_id:
            self._json(400, {"ok": False, "reason": "缺少 robot_id"})
            return
        want_line = bool(payload.get("want_line"))
        try:
            result = self._reg().idle(robot_id, want_line=want_line)
        except FileNotFoundError:
            self._json(404, {"ok": False, "reason": "机器人不存在"})
            return
        status = 200 if result.get("ok") else 400
        self._json(status, result)


def make_server(host: str, port: int, data_root: Path) -> ThreadingHTTPServer:
    load_dotenv()
    registry = SessionRegistry(data_root)
    handler = type(
        "BoundStudioHandler",
        (StudioHandler,),
        {"data_root": data_root, "registry": registry},
    )
    return ThreadingHTTPServer((host, port), handler)
