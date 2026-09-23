from __future__ import annotations

import copy
import json
import sqlite3
from pathlib import Path
from uuid import uuid4

from desktop_robot.game.blueprints import (
    Blueprint,
    classic_xiaofang_blueprint,
    derived_equipped,
    structure_metrics,
    validate_blueprint,
)
from desktop_robot.game.missions_open import CHALLENGE, OPEN_CHALLENGES, evaluate_drawer_result
from desktop_robot.game.parts import PART_DEFINITIONS
from desktop_robot.passport.generate import generate_robot


def _part_card(defn) -> dict:
    return dict(
        id=defn.id,
        name=defn.name,
        category=defn.category,
        description=defn.description,
        power=int(defn.power_w),
        ports=defn.ports,
        price=defn.price,
        ability=defn.ability,
        icon=defn.icon,
        owned=defn.owned_by_default,
    )


def _part_def_min(defn) -> dict:
    """编辑器 / 试验场最小零件定义：尺寸、质量、行为与连接点。"""
    return {
        "id": defn.id,
        "size_m": list(defn.size_m),
        "mass_kg": float(defn.mass_kg),
        "behaviors": sorted(defn.behaviors),
        "connection_points": [
            {
                "id": point.id,
                "pose": point.pose.model_dump(mode="json"),
                "kinds": sorted(point.kinds),
            }
            for point in defn.connection_points
        ],
    }


def _active_blueprint_raw(state: dict) -> dict | None:
    active_id = state.get("active_blueprint_id")
    for raw in state.get("blueprints") or []:
        if raw.get("id") == active_id:
            return raw
    blueprints = state.get("blueprints") or []
    return blueprints[0] if blueprints else None


PART_DEFS = [_part_def_min(d) for d in PART_DEFINITIONS.values()]


# 快照仍只暴露旧七件，避免 UI 一次塞满未实装零件
LEGACY_UI_PART_IDS = ["camera", "arm", "arm_left", "wheels", "battery", "display", "tracks"]
PARTS = [_part_card(PART_DEFINITIONS[i]) for i in LEGACY_UI_PART_IDS]
PART_BY_ID = {p["id"]: p for p in PARTS}
MISSIONS = [
    dict(id="first-light", title="找回能量核心", subtitle="书桌上的第一次冒险", description="装上摄像头与机械臂，扫描并搬回散落的核心。", reward=80, xp=30, target=[6, 2], requires=["camera", "arm"], memory="第一次出发", quote="原来，我们真的可以把小小的光带回家。"),
    dict(id="across-books", title="书本之间的秘密", subtitle="换个方向，总有一条路", description="绕过书本与文具，从桌角带回第二枚核心。", reward=100, xp=40, target=[7, 5], requires=["camera", "arm"], memory="绕过小小的山", quote="书本那么高，但你总能找到一条路。"),
    dict(id="little-stage", title="给工坊一个惊喜", subtitle="搬运，也要有一点仪式感", description="带上表情屏幕，把最后一枚核心带回工坊。功耗不够时，试试扩容电池。", reward=120, xp=50, target=[5, 6], requires=["camera", "arm", "display"], memory="我们的亮灯时刻", quote="你看，整个工坊都亮起来了。"),
]
BLOCKED = [[3, 2], [3, 3], [3, 4], [4, 4], [5, 4], [6, 4]]
LOW_OBSTACLES = [[2, 3], [6, 3]]
HOME = [1, 1]


class GameError(ValueError):
    pass


def initial_state() -> dict:
    equipped = ["wheels", "display"]
    bp = classic_xiaofang_blueprint(equipped)
    return dict(
        version=3,
        revision=0,
        name="小方",
        robot_id=None,
        coins=140,
        energy=100,
        owned=[p["id"] for p in PARTS if p["owned"]],
        equipped=equipped,
        completed=[],
        completed_challenges=[],
        xp=0,
        memories=[],
        active=None,
        challenge=None,
        accent="teal",
        blueprints=[bp.model_dump(mode="json")],
        active_blueprint_id=bp.id,
    )


def migrate_state(state: dict) -> dict:
    if state.get("version", 1) < 2:
        if "arm_left" not in state["owned"]:
            state["owned"].append("arm_left")
        if state["active"]:
            state["active"].setdefault("facing", [0, 1])
        state["version"] = 2
    if state.get("version", 1) < 3:
        bp = classic_xiaofang_blueprint(list(state.get("equipped", [])))
        state["blueprints"] = [bp.model_dump(mode="json")]
        state["active_blueprint_id"] = bp.id
        state["version"] = 3
    state.setdefault("completed_challenges", [])
    state.setdefault("challenge", None)
    return state


def sync_blueprint_with_equipped(state: dict) -> None:
    bp = classic_xiaofang_blueprint(
        state["equipped"],
        blueprint_id=state.get("active_blueprint_id") or "classic",
    )
    state["active_blueprint_id"] = bp.id
    others = [b for b in state.get("blueprints", []) if b.get("id") != bp.id]
    state["blueprints"] = others + [bp.model_dump(mode="json")]


def power(state: dict) -> tuple[int, int]:
    return 2 + sum(PART_BY_ID[p]["power"] for p in state["equipped"]), 18 if "battery" in state["equipped"] else 12


def has_requirement(state: dict, part: str) -> bool:
    if part == "arm":
        return bool({"arm", "arm_left"}.intersection(state["equipped"]))
    return part in state["equipped"]


def snapshot(state: dict) -> dict:
    used, capacity = power(state)
    result = {
        **state,
        "power": used,
        "capacity": capacity,
        "ports": sum(PART_BY_ID[p]["ports"] for p in state["equipped"]),
        "level": 1 + state["xp"] // 40,
        "parts": PARTS,
        "part_defs": PART_DEFS,
        "missions": MISSIONS,
        "open_challenges": list(OPEN_CHALLENGES),
        "world": {"size": 9, "home": HOME, "blocked": BLOCKED, "low": LOW_OBSTACLES},
    }
    active_id = state.get("active_blueprint_id")
    if active_id:
        for raw in state.get("blueprints") or []:
            if raw.get("id") == active_id:
                result["metrics"] = structure_metrics(Blueprint.model_validate(raw))
                break
    return result


def apply_action(state: dict, payload: dict) -> str:
    action = payload.get("action")
    active = state["active"]
    if action == "pause":
        if active:
            active["paused"] = True
        return "已返回工坊，任务进度已保留，可以改装和充电。"
    if action == "resume":
        if not active:
            raise GameError("当前没有可继续的任务。")
        mission = next(m for m in MISSIONS if m["id"] == active["mission"])
        if not {"wheels", "tracks"}.intersection(state["equipped"]):
            raise GameError("请先安装一个移动底盘，再继续任务。")
        missing = ["机械臂（左/右任选）" if p == "arm" else PART_BY_ID[p]["name"]
                   for p in mission["requires"] if not has_requirement(state, p)]
        if missing:
            raise GameError("继续任务前还需要安装：" + "、".join(missing))
        if active["position"] in LOW_OBSTACLES and "tracks" not in state["equipped"]:
            raise GameError("暂停位置在低矮障碍上，需要装回履带才能继续。")
        if state["energy"] < 1:
            raise GameError("请先在工坊充电，再继续任务。")
        active["paused"] = False
        return "继续上次的探索，位置和核心都还在。"
    if action == "equip":
        if active and not active.get("paused", False):
            raise GameError("正在探索，请点击工坊或改装，暂停任务后再调整零件。")
        part = payload.get("part")
        if not isinstance(part, str) or part not in state["owned"]:
            raise GameError("请先解锁这个零件。")
        equipped = list(state["equipped"])
        if part in equipped:
            equipped.remove(part)
        else:
            if part in ("wheels", "tracks"):
                equipped = [p for p in equipped if p not in ("wheels", "tracks")]
            equipped.append(part)
        trial = {**state, "equipped": equipped}
        used, capacity = power(trial)
        if used > capacity:
            raise GameError(f"功耗 {used} W 超过 {capacity} W：先卸下表情屏幕，或安装扩容电池。")
        if sum(PART_BY_ID[p]["ports"] for p in equipped) > 4:
            raise GameError("接口已满，请卸下一个零件。")
        state["equipped"] = equipped
        sync_blueprint_with_equipped(state)
        return "装配已保存，伙伴的能力也更新了。"
    if action == "buy":
        part = payload.get("part")
        if not isinstance(part, str) or part not in PART_BY_ID:
            raise GameError("没有这个零件。")
        if part in state["owned"]:
            raise GameError("已经拥有这个零件了。")
        cost = PART_BY_ID[part]["price"]
        if state["coins"] < cost:
            raise GameError("零件币不足，完成委托可以获得更多。")
        state["coins"] -= cost
        state["owned"].append(part)
        return "新零件已加入零件库，点击即可安装。"
    if action == "rename":
        name = payload.get("name")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 16:
            raise GameError("名字需要 1～16 个字。")
        state["name"] = name.strip()
        return "记住了，这是我的新名字。"
    if action == "blueprint_replace":
        raw_bp = payload.get("blueprint")
        if not isinstance(raw_bp, dict):
            raise GameError("需要提供蓝图对象。")
        try:
            bp = Blueprint.model_validate(raw_bp)
        except Exception as exc:
            raise GameError(f"蓝图格式无效：{exc}") from exc
        errors = validate_blueprint(bp)
        if errors:
            raise GameError("蓝图校验失败：" + "；".join(f"{e.code}: {e.message}" for e in errors))
        dumped = bp.model_dump(mode="json")
        active_id = state.get("active_blueprint_id")
        blueprints = list(state.get("blueprints") or [])
        replaced = False
        for i, existing in enumerate(blueprints):
            if existing.get("id") == active_id or existing.get("id") == bp.id:
                blueprints[i] = dumped
                replaced = True
                break
        if not replaced:
            blueprints.append(dumped)
        state["blueprints"] = blueprints
        state["active_blueprint_id"] = bp.id
        try:
            derived = derived_equipped(bp)
            state["equipped"] = [p for p in derived if p in PART_BY_ID]
        except Exception:
            pass
        return "蓝图已保存。"
    if action == "blueprint_rename":
        name = payload.get("name")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 32:
            raise GameError("蓝图名称需要 1～32 个字。")
        active_id = state.get("active_blueprint_id")
        found = False
        for bp in state.get("blueprints") or []:
            if bp.get("id") == active_id:
                bp["name"] = name.strip()
                found = True
                break
        if not found:
            raise GameError("当前没有可重命名的蓝图。")
        return "蓝图已改名。"
    if action == "enter_yard":
        active = _active_blueprint_raw(state)
        if not active:
            raise GameError("当前没有可带进试验场的蓝图。")
        state["yard_snapshot"] = copy.deepcopy(active)
        return "已进入试验场。试跑不会改动蓝图，回编辑可恢复快照。"
    if action == "exit_yard":
        snap = state.get("yard_snapshot")
        if isinstance(snap, dict) and snap.get("id"):
            blueprints = list(state.get("blueprints") or [])
            restored = False
            for i, existing in enumerate(blueprints):
                if existing.get("id") == snap["id"]:
                    blueprints[i] = copy.deepcopy(snap)
                    restored = True
                    break
            if not restored:
                blueprints.append(copy.deepcopy(snap))
            state["blueprints"] = blueprints
            state["active_blueprint_id"] = snap["id"]
        state.pop("yard_snapshot", None)
        return "已返回编辑。试验场姿态未写入蓝图。"
    if action == "yard_reset":
        # 客户端负责复位位姿与方块；服务端仅确认
        return "试验场已复位。"
    if action == "start_challenge":
        mission_id = payload.get("mission")
        if mission_id != CHALLENGE["id"]:
            raise GameError("找不到这个开放挑战。")
        bp = _active_blueprint_raw(state)
        if not bp:
            raise GameError("当前没有可带进挑战的蓝图。")
        state["challenge"] = {
            "id": CHALLENGE["id"],
            "run_id": uuid4().hex,
            "blueprint_id": bp.get("id"),
            "blueprint_version": int(bp.get("version") or bp.get("revision") or 1),
            "started": True,
        }
        return "抽屉挑战已开始：把方块运到接收区并停稳。"
    if action == "submit_challenge":
        challenge = state.get("challenge")
        if not isinstance(challenge, dict) or not challenge.get("run_id"):
            raise GameError("请先开始抽屉挑战。")
        if payload.get("run_id") != challenge["run_id"]:
            raise GameError("挑战回合已过期，请重新开始。")
        if challenge.get("blueprint_id") != state.get("active_blueprint_id"):
            raise GameError("挑战蓝图与当前蓝图不一致，请重新开始挑战。")
        result = evaluate_drawer_result(
            {
                "block_id": payload.get("block_id"),
                "region": payload.get("region"),
                "speed": payload.get("speed"),
            }
        )
        if not result["ok"]:
            raise GameError(result["reason"])
        completed = state.setdefault("completed_challenges", [])
        first = CHALLENGE["id"] not in completed
        if first:
            state["coins"] += int(CHALLENGE["reward"])
            state["xp"] += int(CHALLENGE["xp"])
            completed.append(CHALLENGE["id"])
            return (
                f"挑战完成！获得 {CHALLENGE['reward']} 零件币和 "
                f"{CHALLENGE['xp']} 默契。"
            )
        return "再次完成挑战！首次奖励已经领取，这次留下新的练习。"
    if action == "appearance":
        if payload.get("accent") not in ("teal", "amber", "sage"):
            raise GameError("请选择已有配色。")
        state["accent"] = payload["accent"]
        return "换好新配色，一起出发吧。"
    if action == "charge":
        if active and not active.get("paused", False):
            raise GameError("正在探索，请先返回工坊暂停任务，再充电。")
        state["energy"] = 100
        return "电量已补满，下一次冒险准备好了。"
    if action == "abandon":
        if not active:
            raise GameError("当前没有进行中的任务。")
        state["active"] = None
        return "已返回工坊。任务没有结算，可以重新出发。"
    if action == "start":
        if active:
            raise GameError("已经有进行中的任务，继续探索吧。")
        mission = next((m for m in MISSIONS if m["id"] == payload.get("mission")), None)
        if not mission:
            raise GameError("找不到这个任务。")
        index = MISSIONS.index(mission)
        if any(m["id"] not in state["completed"] for m in MISSIONS[:index]):
            raise GameError("先完成前一个委托。")
        if not {"wheels", "tracks"}.intersection(state["equipped"]):
            raise GameError("请先安装一个移动底盘。")
        missing = ["机械臂（左/右任选）" if p == "arm" else PART_BY_ID[p]["name"]
                   for p in mission["requires"] if not has_requirement(state, p)]
        if missing:
            raise GameError("还需要安装：" + "、".join(missing))
        if state["energy"] < 40:
            raise GameError("先到工坊充电，再开始冒险。")
        state["active"] = dict(mission=mission["id"], position=list(HOME), facing=[0, 1], paused=False, scanned=False, carrying=False, moves=0)
        return "点击桌面移动，靠近目标后扫描。方向键也可以控制。"
    if not active:
        raise GameError("先从委托板选择一个任务。")
    if active.get("paused", False):
        raise GameError("任务已暂停，请从委托板继续探索。")
    mission = next(m for m in MISSIONS if m["id"] == active["mission"])
    if action == "move":
        pos = payload.get("position")
        if not isinstance(pos, list) or len(pos) != 2 or any(type(v) is not int or not 0 <= v < 9 for v in pos):
            raise GameError("目标位置不在桌面内。")
        if sum(abs(a - b) for a, b in zip(pos, active["position"])) != 1:
            raise GameError("每次只能移动到相邻格子。")
        if pos in BLOCKED or (pos in LOW_OBSTACLES and "tracks" not in state["equipped"]):
            raise GameError("这里有障碍，换条路试试。履带可以越过低矮障碍。")
        if state["energy"] < 1:
            raise GameError("电量耗尽，返回工坊充电后再试。")
        state["energy"] -= 1
        active["facing"] = [b - a for a, b in zip(active["position"], pos)]
        active["position"] = pos
        active["moves"] += 1
        return ""
    distance = sum(abs(a - b) for a, b in zip(active["position"], mission["target"]))
    if action == "scan":
        if "camera" not in state["equipped"]:
            raise GameError("需要摄像头才能扫描。")
        if distance > 2:
            raise GameError("信号还很远，再靠近琥珀色光点一些。")
        active["scanned"] = True
        return "发现能量核心！靠近到一格以内，就可以搬运。"
    if action == "pick":
        if not has_requirement(state, "arm") or not active["scanned"] or distance > 1:
            raise GameError("先扫描核心，再靠近到一格以内使用机械臂。")
        if active["carrying"]:
            raise GameError("已经拿到核心，回到青色充电站交付吧。")
        active["carrying"] = True
        return "拿到了！回到青色充电站，点击交付。"
    if action == "deliver":
        if not active["carrying"] or active["position"] != HOME:
            raise GameError("带着核心回到青色充电站，才能完成交付。")
        first = mission["id"] not in state["completed"]
        if first:
            state["coins"] += mission["reward"]
            state["xp"] += mission["xp"]
            state["completed"].append(mission["id"])
            state["memories"].append(dict(title=mission["memory"], quote=mission["quote"], mission=mission["id"]))
        state["active"] = None
        return f"委托完成！获得 {mission['reward']} 零件币和 {mission['xp']} 默契。" if first else "再次完成挑战！首次奖励已经领取，这次留下新的练习。"
    raise GameError("不支持的游戏操作。")


class GameStore:
    """One local workshop per data root; SQLite serializes concurrent tabs and rewards."""

    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / "workshop.sqlite3"
        with self.connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS game (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT NOT NULL)")
            db.execute("INSERT OR IGNORE INTO game VALUES(1, ?)", (json.dumps(initial_state()),))
            state = json.loads(db.execute("SELECT state FROM game WHERE id=1").fetchone()[0])
            before = state.get("version", 1)
            migrate_state(state)
            if state.get("version", 1) != before:
                state["revision"] += 1
                db.execute("UPDATE game SET state=? WHERE id=1", (json.dumps(state, ensure_ascii=False),))

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def get(self) -> dict:
        with self.connect() as db:
            return snapshot(json.loads(db.execute("SELECT state FROM game WHERE id=1").fetchone()[0]))

    def act(self, payload: dict) -> tuple[dict, str]:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            state = json.loads(db.execute("SELECT state FROM game WHERE id=1").fetchone()[0])
            if type(payload.get("revision")) is not int or payload["revision"] != state["revision"]:
                raise GameError("存档已更新，请刷新页面后再试。")
            message = apply_action(state, payload)
            if not state["robot_id"]:
                passport = generate_robot(data_root=self.root, name=state["name"], route="custom",
                    skill_ids=["chat.base", "memory.base", "face.perform", "persona.cheer"])
                state["robot_id"] = passport.robot_id
            if payload.get("action") == "rename":
                from desktop_robot.passport.store import load_passport, passport_path, save_passport
                passport = load_passport(passport_path(self.root, state["robot_id"]))
                passport.name = state["name"]
                save_passport(self.root, passport)
            state["revision"] += 1
            db.execute("UPDATE game SET state=? WHERE id=1", (json.dumps(state, ensure_ascii=False),))
        return snapshot(state), message
