"""自由装配零件定义目录。

提供 PartDefinition 与首批可组合零件；经典零件 ID 保留以便存档迁移与 UI 投影。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class Pose(BaseModel):
    """局部位姿：欧拉角为弧度，相对父连接。坐标系 Y 向上、+Z 为前。"""

    model_config = ConfigDict(frozen=True)

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    rx: float = 0.0
    ry: float = 0.0
    rz: float = 0.0


class ConnectionPoint(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    pose: Pose
    kinds: frozenset[str]


class PartDefinition(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    name: str
    category: str
    mass_kg: float = Field(gt=0)
    power_w: float = 0.0
    ports: int = 0
    connection_points: tuple[ConnectionPoint, ...]
    behaviors: frozenset[str] = Field(default_factory=frozenset)
    size_m: tuple[float, float, float]
    owned_by_default: bool = False
    price: int = 0
    description: str = ""
    icon: str = ""
    ability: str = ""


def _pose(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Pose:
    return Pose(x=x, y=y, z=z)


def _point(point_id: str, kinds: frozenset[str], *, x: float = 0.0, y: float = 0.0, z: float = 0.0) -> ConnectionPoint:
    return ConnectionPoint(id=point_id, pose=_pose(x, y, z), kinds=kinds)


def _part(
    part_id: str,
    *,
    name: str,
    category: str,
    mass_kg: float,
    size_m: tuple[float, float, float],
    connection_points: tuple[ConnectionPoint, ...],
    behaviors: frozenset[str] = frozenset(),
    power_w: float = 0.0,
    ports: int = 0,
    owned_by_default: bool = True,
    price: int = 0,
    description: str = "",
    icon: str = "",
    ability: str = "",
) -> PartDefinition:
    if not connection_points:
        raise ValueError(f"{part_id} must have at least one connection point")
    return PartDefinition(
        id=part_id,
        name=name,
        category=category,
        mass_kg=mass_kg,
        power_w=power_w,
        ports=ports,
        connection_points=connection_points,
        behaviors=behaviors,
        size_m=size_m,
        owned_by_default=owned_by_default,
        price=price,
        description=description,
        icon=icon,
        ability=ability,
    )


_STRUCTURE = frozenset({"structure"})
_AXLE = frozenset({"axle", "structure"})
_JOINT = frozenset({"joint", "structure"})
_TOOL = frozenset({"tool", "structure"})
_MOUNT = frozenset({"structure"})
_ROOT = frozenset({"root", "structure"})
_ARMOR = frozenset({"armor", "structure"})
_WEAPON = frozenset({"weapon", "structure"})
_THRUST = frozenset({"thrust", "structure"})
_WINCH = frozenset({"winch", "tool", "structure"})


def _build_catalog() -> dict[str, PartDefinition]:
    core = _part(
        "core",
        name="伙伴核心",
        category="核心",
        mass_kg=0.45,
        # 略放大核心，拉开机甲区域挂点，避免头/肩/腿糊成一团
        size_m=(0.1, 0.12, 0.1),
        power_w=2.0,
        ports=0,
        owned_by_default=True,
        price=0,
        description="身份、主控制与结构根节点；含机甲区域挂点。",
        icon="core",
        ability="控制",
        connection_points=(
            _point("root", _ROOT),
            _point("mount_top", _STRUCTURE, y=0.06),
            _point("mount_front", _STRUCTURE, z=0.05),
            _point("mount_back", _STRUCTURE, z=-0.05),
            _point("mount_left", _STRUCTURE, x=-0.05),
            _point("mount_right", _STRUCTURE, x=0.05),
            _point("mount_bottom", _STRUCTURE, y=-0.06),
            # 机甲区域槽：肩距拉宽、头抬高，轮廓可读
            _point("slot_head", _ARMOR, y=0.08),
            _point("slot_shoulder_l", _ARMOR, x=-0.1, y=0.04, z=0.01),
            _point("slot_shoulder_r", _ARMOR, x=0.1, y=0.04, z=0.01),
            _point("slot_backpack", frozenset({"structure", "thrust", "armor"}), z=-0.08, y=0.02),
            _point("slot_hip", _STRUCTURE, y=-0.08),
        ),
    )

    plate = _part(
        "plate",
        name="板件",
        category="结构",
        mass_kg=0.12,
        size_m=(0.14, 0.02, 0.14),
        description="扁平结构件，用于扩展安装面。",
        icon="plate",
        ability="结构",
        connection_points=(
            _point("face_a", _STRUCTURE, y=0.01),
            _point("face_b", _STRUCTURE, y=-0.01),
            _point("face_c", _STRUCTURE, z=0.07),
            _point("face_d", _STRUCTURE, z=-0.07),
        ),
    )

    beam = _part(
        "beam",
        name="连接杆",
        category="结构",
        mass_kg=0.05,
        size_m=(0.02, 0.02, 0.12),
        description="细长杆件，用于加长臂展或框架。",
        icon="beam",
        ability="结构",
        connection_points=(
            _point("end_a", frozenset({"structure", "joint"}), z=0.06),
            _point("end_b", frozenset({"structure", "joint"}), z=-0.06),
        ),
    )

    post = _part(
        "post",
        name="立柱",
        category="结构",
        mass_kg=0.08,
        size_m=(0.03, 0.12, 0.03),
        description="竖直立柱，用于抬高安装高度。",
        icon="post",
        ability="结构",
        connection_points=(
            _point("end_a", _STRUCTURE, y=0.06),
            _point("end_b", _STRUCTURE, y=-0.06),
        ),
    )

    wheel = _part(
        "wheel",
        name="单轮",
        category="移动",
        mass_kg=0.08,
        size_m=(0.03, 0.08, 0.08),
        power_w=0.0,
        ports=0,
        behaviors=frozenset({"roll"}),
        description="被动滚轮，需与驱动件组合。",
        icon="wheel",
        ability="滚动",
        connection_points=(_point("hub", _AXLE),),
    )

    drive_wheel = _part(
        "drive_wheel",
        name="驱动轮模块",
        category="移动",
        mass_kg=0.12,
        size_m=(0.03, 0.06, 0.06),
        power_w=1.0,
        ports=1,
        behaviors=frozenset({"roll"}),
        description="带动力的轮组模块。",
        icon="drive_wheel",
        ability="驱动",
        connection_points=(_point("hub", _AXLE),),
    )

    track_module = _part(
        "track_module",
        name="履带模块",
        category="移动",
        mass_kg=0.2,
        size_m=(0.04, 0.05, 0.12),
        power_w=2.0,
        ports=1,
        behaviors=frozenset({"track"}),
        description="可越障的履带单元。",
        icon="track_module",
        ability="越障",
        connection_points=(_point("hub", _AXLE),),
    )

    revolute_joint = _part(
        "revolute_joint",
        name="转动关节",
        category="关节",
        mass_kg=0.1,
        size_m=(0.04, 0.04, 0.04),
        power_w=1.0,
        ports=1,
        behaviors=frozenset({"pivot"}),
        description="两端可转的枢轴关节。",
        icon="revolute",
        ability="转动",
        connection_points=(
            _point("in", _JOINT, z=-0.02),
            _point("out", _JOINT, z=0.02),
        ),
    )

    prism_joint = _part(
        "prism_joint",
        name="伸缩模块",
        category="关节",
        mass_kg=0.12,
        size_m=(0.04, 0.04, 0.08),
        power_w=1.5,
        ports=1,
        behaviors=frozenset({"extend"}),
        description="沿轴向伸缩的直线关节。",
        icon="prism",
        ability="伸缩",
        connection_points=(
            _point("in", _JOINT, z=-0.04),
            _point("out", _JOINT, z=0.04),
        ),
    )

    gripper = _part(
        "gripper",
        name="夹爪",
        category="工具",
        mass_kg=0.1,
        size_m=(0.04, 0.04, 0.06),
        power_w=2.0,
        ports=1,
        behaviors=frozenset({"grasp"}),
        description="抓取并搬运物体。",
        icon="gripper",
        ability="抓取",
        connection_points=(_point("mount", _TOOL, z=-0.03),),
    )

    pusher = _part(
        "pusher",
        name="推板",
        category="工具",
        mass_kg=0.08,
        size_m=(0.08, 0.04, 0.02),
        power_w=0.5,
        ports=1,
        behaviors=frozenset({"push"}),
        description="推开或推动目标。",
        icon="pusher",
        ability="推动",
        connection_points=(_point("mount", _TOOL, z=-0.01),),
    )

    hook = _part(
        "hook",
        name="钩子",
        category="工具",
        mass_kg=0.06,
        size_m=(0.03, 0.06, 0.04),
        power_w=0.5,
        ports=1,
        behaviors=frozenset({"drag"}),
        description="从外侧钩住并拖拽物体。",
        icon="hook",
        ability="拖拽",
        connection_points=(_point("mount", _TOOL, z=-0.02),),
    )

    bucket = _part(
        "bucket",
        name="货斗",
        category="工具",
        mass_kg=0.15,
        size_m=(0.1, 0.06, 0.08),
        power_w=0.0,
        ports=1,
        behaviors=frozenset({"carry"}),
        description="装载并运输散件。",
        icon="bucket",
        ability="装载",
        connection_points=(_point("mount", _TOOL, z=-0.04),),
    )

    armor_torso = _part(
        "armor_torso",
        name="躯干装甲",
        category="装甲",
        mass_kg=0.32,
        size_m=(0.16, 0.16, 0.14),
        power_w=0.0,
        ports=0,
        behaviors=frozenset({"armor"}),
        owned_by_default=True,
        price=0,
        description="覆盖核心的斜切装甲，改变正面轮廓与防御质量。",
        icon="armor",
        ability="防护",
        connection_points=(
            _point("mount", _ARMOR, z=-0.07),
            _point("face_front", _STRUCTURE, z=0.07),
            _point("face_top", _STRUCTURE, y=0.08),
        ),
    )

    armor_shoulder = _part(
        "armor_shoulder",
        name="肩甲模块",
        category="装甲",
        mass_kg=0.14,
        size_m=(0.12, 0.08, 0.1),
        behaviors=frozenset({"armor"}),
        owned_by_default=True,
        price=40,
        description="肩部装甲挂架，可再挂武器或附件。",
        icon="shoulder",
        ability="肩挂",
        connection_points=(
            _point("mount", _ARMOR),
            _point("hardpoint", _WEAPON, y=0.05, z=0.02),
        ),
    )

    mecha_head = _part(
        "mecha_head",
        name="机甲头罩",
        category="装甲",
        mass_kg=0.12,
        size_m=(0.1, 0.1, 0.12),
        behaviors=frozenset({"armor"}),
        owned_by_default=True,
        price=0,
        description="传感头罩与观察窗，决定机甲上轮廓。",
        icon="head",
        ability="传感",
        connection_points=(_point("mount", _ARMOR, y=-0.05),),
    )

    mecha_leg = _part(
        "mecha_leg",
        name="机甲腿架",
        category="移动",
        mass_kg=0.22,
        size_m=(0.07, 0.18, 0.09),
        power_w=0.5,
        ports=1,
        behaviors=frozenset({"roll", "structure"}),
        owned_by_default=True,
        price=50,
        description="带轮毂接口的腿架，撑起机甲站立轮廓。",
        icon="leg",
        ability="支撑",
        connection_points=(
            _point("mount", _STRUCTURE, y=0.09),
            _point("hub", _AXLE, y=-0.08),
            _point("toe", _STRUCTURE, z=0.04, y=-0.08),
        ),
    )

    backpack_frame = _part(
        "backpack_frame",
        name="背包框架",
        category="结构",
        mass_kg=0.16,
        size_m=(0.12, 0.14, 0.1),
        behaviors=frozenset({"armor"}),
        owned_by_default=True,
        price=60,
        description="背部挂架，可装推进器、绞盘或储物。",
        icon="backpack",
        ability="背挂",
        connection_points=(
            _point("mount", frozenset({"structure", "thrust", "armor"}), z=0.05),
            _point("bay", frozenset({"structure", "thrust", "winch"}), z=-0.05),
        ),
    )

    weapon_rifle = _part(
        "weapon_rifle",
        name="工程步枪",
        category="武器",
        mass_kg=0.18,
        size_m=(0.05, 0.05, 0.22),
        power_w=2.0,
        ports=1,
        behaviors=frozenset({"weapon"}),
        owned_by_default=True,
        price=120,
        description="肩挂或臂挂远程武器，消耗热量与弹药。",
        icon="rifle",
        ability="射击",
        connection_points=(
            _point("mount", _WEAPON, z=-0.1),
            _point("muzzle", frozenset({"weapon"}), z=0.11),
        ),
    )

    thruster_pack = _part(
        "thruster_pack",
        name="短时推进背包",
        category="推进",
        mass_kg=0.2,
        size_m=(0.08, 0.1, 0.08),
        power_w=3.0,
        ports=1,
        behaviors=frozenset({"thrust"}),
        owned_by_default=False,
        price=180,
        description="短时冲刺与跃升，受燃料与热量限制。",
        icon="thrust",
        ability="推进",
        connection_points=(_point("mount", _THRUST, z=0.04),),
    )

    winch_module = _part(
        "winch_module",
        name="绞盘模块",
        category="工具",
        mass_kg=0.15,
        size_m=(0.06, 0.06, 0.08),
        power_w=2.0,
        ports=1,
        behaviors=frozenset({"winch"}),
        owned_by_default=False,
        price=160,
        description="发射钩索牵引自身或目标，解锁锚点路线。",
        icon="winch",
        ability="牵引",
        connection_points=(_point("mount", _WINCH, z=-0.04),),
    )

    heavy_plate = _part(
        "heavy_plate",
        name="重型装甲板",
        category="装甲",
        mass_kg=0.4,
        size_m=(0.14, 0.04, 0.12),
        behaviors=frozenset({"armor"}),
        owned_by_default=False,
        price=140,
        description="厚重装甲，提高承伤，显著增加质量与转向惯性。",
        icon="heavy",
        ability="重甲",
        connection_points=(
            _point("mount", _ARMOR, y=-0.02),
            _point("face_a", _STRUCTURE, y=0.02),
        ),
    )

    # 与 engine.PARTS 对齐的经典零件（含迁移别名）
    battery = _part(
        "battery",
        name="扩容电池",
        category="能源",
        mass_kg=0.25,
        size_m=(0.05, 0.04, 0.08),
        power_w=0.0,
        ports=0,
        owned_by_default=False,
        price=100,
        description="供电上限提升到 18 W，远行更从容。",
        icon="battery",
        ability="扩容",
        connection_points=(_point("mount", _MOUNT),),
    )

    camera = _part(
        "camera",
        name="摄像头",
        category="感知",
        mass_kg=0.05,
        size_m=(0.04, 0.03, 0.04),
        power_w=3.0,
        ports=1,
        owned_by_default=True,
        price=60,
        description="扫描桌面，发现藏起来的目标。",
        icon="scan",
        ability="扫描",
        connection_points=(_point("mount", _MOUNT),),
    )

    display = _part(
        "display",
        name="表情屏幕",
        category="互动",
        mass_kg=0.04,
        size_m=(0.06, 0.04, 0.02),
        power_w=2.0,
        ports=1,
        owned_by_default=True,
        price=40,
        description="让每一次相遇，都多一点表情。",
        icon="face",
        ability="表演",
        connection_points=(_point("mount", _MOUNT),),
    )

    wheels = _part(
        "wheels",
        name="轮式底盘",
        category="动作",
        mass_kg=0.35,
        size_m=(0.14, 0.05, 0.14),
        power_w=2.0,
        ports=1,
        owned_by_default=True,
        price=0,
        behaviors=frozenset({"roll"}),
        description="轻快、灵活，适合平整的桌面。",
        icon="wheels",
        ability="移动",
        connection_points=(_point("mount", _MOUNT, y=0.025),),
    )

    tracks = _part(
        "tracks",
        name="履带底盘",
        category="动作",
        mass_kg=0.5,
        size_m=(0.14, 0.06, 0.16),
        power_w=4.0,
        ports=1,
        owned_by_default=False,
        price=120,
        behaviors=frozenset({"track"}),
        description="越过桌面的小障碍；与轮式底盘互斥。",
        icon="tracks",
        ability="越障",
        connection_points=(_point("mount", _MOUNT, y=0.03),),
    )

    arm = _part(
        "arm",
        name="右机械臂",
        category="动作",
        mass_kg=0.3,
        size_m=(0.04, 0.04, 0.18),
        power_w=5.0,
        ports=1,
        owned_by_default=True,
        price=80,
        behaviors=frozenset({"grasp"}),
        description="安装在正面右侧；独立装卸，单臂即可搬运核心。",
        icon="arm",
        ability="搬运",
        connection_points=(_point("base", _MOUNT, z=-0.09),),
    )

    arm_left = _part(
        "arm_left",
        name="左机械臂",
        category="动作",
        mass_kg=0.3,
        size_m=(0.04, 0.04, 0.18),
        power_w=5.0,
        ports=1,
        owned_by_default=True,
        price=80,
        behaviors=frozenset({"grasp"}),
        description="安装在正面左侧；独立装卸，单臂即可搬运核心。",
        icon="arm",
        ability="搬运",
        connection_points=(_point("base", _MOUNT, z=-0.09),),
    )

    parts = (
        core,
        plate,
        beam,
        post,
        wheel,
        drive_wheel,
        track_module,
        revolute_joint,
        prism_joint,
        gripper,
        pusher,
        hook,
        bucket,
        armor_torso,
        armor_shoulder,
        mecha_head,
        mecha_leg,
        backpack_frame,
        weapon_rifle,
        thruster_pack,
        winch_module,
        heavy_plate,
        battery,
        camera,
        display,
        wheels,
        tracks,
        arm,
        arm_left,
    )
    return {p.id: p for p in parts}


PART_DEFINITIONS: dict[str, PartDefinition] = _build_catalog()


def get_part(part_id: str) -> PartDefinition:
    """按 ID 返回零件定义；未知 ID 抛出 KeyError。"""
    return PART_DEFINITIONS[part_id]
