from __future__ import annotations

from dataclasses import asdict, dataclass, field

from desktop_robot.hardware.types import CustomBoard, CustomComponent, HardwareAssembly, PhysicalSpec


@dataclass(frozen=True)
class BoardCard:
    id: str
    name: str
    summary: str
    architecture: str
    brain_mode: str
    price_cny: int
    base_power_w: float
    power_limit_w: float
    ports: dict[str, int]
    capabilities: tuple[str, ...]
    color: str
    physical: PhysicalSpec = field(default_factory=PhysicalSpec)


@dataclass(frozen=True)
class ComponentCard:
    id: str
    name: str
    category: str
    summary: str
    price_cny: int
    power_w: float
    requires_ports: dict[str, int]
    provides: tuple[str, ...]
    compatible_slots: tuple[str, ...]
    requires_board_capabilities: tuple[str, ...] = ()
    power_output_w: float = 0
    color: str = "#5b8def"
    physical: PhysicalSpec = field(default_factory=PhysicalSpec)


BOARDS: dict[str, BoardCard] = {
    "board.pi-zero-2w": BoardCard(
        id="board.pi-zero-2w", name="Raspberry Pi Zero 2 W",
        summary="Linux 一体机主路径，适合云端 LLM 与本地控制",
        architecture="arm64-linux", brain_mode="local", price_cny=160,
        base_power_w=3.5, power_limit_w=15,
        ports={"usb": 2, "gpio": 20, "pwm": 2, "spi": 1, "i2c": 1, "csi": 1},
        capabilities=("linux", "wifi", "bluetooth", "local_brain"), color="#42a36f",
        physical=PhysicalSpec(dimensions_mm=(65, 30, 5), mass_g=16, cad_query="Raspberry Pi Zero 2 W", source="vendor nominal envelope", confidence="estimated"),
    ),
    "board.orange-pi-zero-3": BoardCard(
        id="board.orange-pi-zero-3", name="Orange Pi Zero 3",
        summary="性能与接口更充裕的 Linux 主控",
        architecture="arm64-linux", brain_mode="local", price_cny=135,
        base_power_w=4.5, power_limit_w=25,
        ports={"usb": 3, "gpio": 26, "pwm": 3, "spi": 2, "i2c": 2, "csi": 1},
        capabilities=("linux", "wifi", "bluetooth", "local_brain"), color="#f28b3c",
    ),
    "board.raspberry-pi-5": BoardCard(
        id="board.raspberry-pi-5", name="Raspberry Pi 5",
        summary="接口和计算性能更强，适合视觉与本地 AI 扩展",
        architecture="arm64-linux", brain_mode="local", price_cny=550,
        base_power_w=8, power_limit_w=27,
        ports={"usb": 4, "gpio": 28, "pwm": 4, "spi": 2, "i2c": 2, "csi": 2},
        capabilities=("linux", "wifi", "bluetooth", "local_brain"), color="#cf4154",
    ),
    "board.jetson-orin-nano-super": BoardCard(
        id="board.jetson-orin-nano-super", name="Jetson Orin Nano Super",
        summary="面向本地视觉、生成式 AI 与复杂机器人计算",
        architecture="arm64-linux", brain_mode="local", price_cny=1999,
        base_power_w=25, power_limit_w=60,
        ports={"usb": 4, "gpio": 28, "pwm": 4, "spi": 2, "i2c": 2, "csi": 2},
        capabilities=("linux", "wifi", "bluetooth", "local_brain", "edge_ai"), color="#76b900",
    ),
    "board.esp32-s3": BoardCard(
        id="board.esp32-s3", name="ESP32-S3",
        summary="低功耗 Body，需要电脑或手机提供 Brain",
        architecture="xtensa", brain_mode="external", price_cny=75,
        base_power_w=1.2, power_limit_w=8,
        ports={"usb": 0, "gpio": 14, "pwm": 6, "spi": 2, "i2c": 2, "csi": 0},
        capabilities=("wifi", "bluetooth", "external_brain"), color="#9b59b6",
        physical=PhysicalSpec(cad_query="ESP32-S3 development board", source="board variant required", confidence="unknown"),
    ),
}


COMPONENTS: dict[str, ComponentCard] = {
    "display.spi-35": ComponentCard(
        id="display.spi-35", name="3.5 寸 SPI 屏", category="display",
        summary="显示表情和状态", price_cny=65, power_w=3,
        requires_ports={"spi": 1, "gpio": 3}, provides=("display.face",),
        compatible_slots=("head.screen",), color="#4b7bec",
    ),
    "audio.usb-combo": ComponentCard(
        id="audio.usb-combo", name="USB 麦克风喇叭", category="audio",
        summary="语音输入与输出", price_cny=48, power_w=2,
        requires_ports={"usb": 1}, provides=("audio.input", "audio.output"),
        compatible_slots=("body.audio",), requires_board_capabilities=("linux",), color="#20a26a",
    ),
    "audio.i2s-combo": ComponentCard(
        id="audio.i2s-combo", name="I²S 麦克风功放", category="audio",
        summary="适合 ESP32 的数字音频模块", price_cny=42, power_w=1.5,
        requires_ports={"i2c": 1, "gpio": 3}, provides=("audio.input", "audio.output"),
        compatible_slots=("body.audio",), color="#30b28a",
    ),
    "motion.pan-tilt": ComponentCard(
        id="motion.pan-tilt", name="SG90 双轴云台", category="motion",
        summary="提供转头和点头", price_cny=32, power_w=4,
        requires_ports={"pwm": 2, "gpio": 2},
        provides=("motion.servo.yaw", "motion.servo.pitch"),
        compatible_slots=("neck.pan_tilt",), color="#e7922f",
        physical=PhysicalSpec(cad_query="SG90 pan tilt bracket assembly", source="catalog family", confidence="placeholder"),
    ),
    "motion.arm-servo": ComponentCard(
        id="motion.arm-servo", name="手臂舵机", category="motion",
        summary="驱动单侧挥手", price_cny=18, power_w=2,
        requires_ports={"pwm": 1, "gpio": 1}, provides=("motion.servo.arm",),
        compatible_slots=("body.arm_left", "body.arm_right"), color="#ef6c57",
        physical=PhysicalSpec(dimensions_mm=(23, 12.2, 29), mass_g=9, cad_query="SG90 micro servo", source="common SG90 nominal envelope", confidence="estimated"),
    ),
    "sensor.usb-camera": ComponentCard(
        id="sensor.usb-camera", name="USB 摄像头", category="sensor",
        summary="视觉观察和跟随", price_cny=39, power_w=2,
        requires_ports={"usb": 1}, provides=("sensor.camera",),
        compatible_slots=("head.camera",), requires_board_capabilities=("linux",), color="#26a7c7",
    ),
    "sensor.csi-camera": ComponentCard(
        id="sensor.csi-camera", name="CSI 摄像头", category="sensor",
        summary="节省 USB 接口的视觉模块", price_cny=55, power_w=1.5,
        requires_ports={"csi": 1}, provides=("sensor.camera",),
        compatible_slots=("head.camera",), requires_board_capabilities=("linux",), color="#39a0c3",
    ),
    "power.usb-15w": ComponentCard(
        id="power.usb-15w", name="5V 3A 电源", category="power",
        summary="15W 稳压供电", price_cny=35, power_w=0,
        requires_ports={}, provides=("power.supply",), compatible_slots=("body.power",),
        power_output_w=15, color="#e0ad2f",
    ),
    "power.usb-25w": ComponentCard(
        id="power.usb-25w", name="5V 5A 电源", category="power",
        summary="舵机较多时使用", price_cny=58, power_w=0,
        requires_ports={}, provides=("power.supply",), compatible_slots=("body.power",),
        power_output_w=25, color="#d99c22",
    ),
    "power.pd-distribution-60w": ComponentCard(
        id="power.pd-distribution-60w", name="60W PD 电池与配电模块", category="power",
        summary="高功率移动电源配合 PD 触发、降压与主控/舵机独立电源轨",
        price_cny=899, power_w=0,
        requires_ports={}, provides=("power.supply",), compatible_slots=("body.power",),
        power_output_w=60, color="#f0b429",
    ),
    "io.usb-hub": ComponentCard(
        id="io.usb-hub", name="四口 USB Hub", category="io",
        summary="占用一个 USB，额外提供四个", price_cny=29, power_w=.5,
        requires_ports={"usb": 1}, provides=("io.usb_hub",), compatible_slots=("body.expansion", "body.expansion_left", "body.expansion_right"),
        color="#778ca3",
    ),
    "io.pca9685": ComponentCard(
        id="io.pca9685", name="PCA9685 舵机驱动板", category="io",
        summary="通过 I²C 扩展 16 路 PWM，适合多舵机机器人", price_cny=22, power_w=.2,
        requires_ports={"i2c": 1}, provides=("io.pwm_expander",),
        compatible_slots=("body.expansion", "body.expansion_left", "body.expansion_right"),
        color="#8b6fc0",
    ),
    "mobility.tracks": ComponentCard(
        id="mobility.tracks", name="双履带底盘", category="mobility",
        summary="提供前进、后退与转向", price_cny=89, power_w=6,
        requires_ports={"pwm": 2, "gpio": 4}, provides=("mobility.drive", "motion.hop"),
        compatible_slots=("base.mobility",), color="#6b7280",
    ),
}


SLOTS = [
    {"id": "head.screen", "name": "面部屏幕", "x": 50, "y": 20, "accepts": ["display"]},
    {"id": "head.camera", "name": "头部摄像头", "x": 50, "y": 9, "accepts": ["sensor"]},
    {"id": "neck.pan_tilt", "name": "颈部云台", "x": 50, "y": 39, "accepts": ["motion"]},
    {"id": "body.mainboard", "name": "主控板", "x": 50, "y": 57, "accepts": ["board"]},
    {"id": "body.audio", "name": "音频模块", "x": 33, "y": 68, "accepts": ["audio"]},
    {"id": "body.power", "name": "电源", "x": 67, "y": 68, "accepts": ["power"]},
    {"id": "body.arm_left", "name": "左臂", "x": 15, "y": 53, "accepts": ["motion"]},
    {"id": "body.arm_right", "name": "右臂", "x": 85, "y": 53, "accepts": ["motion"]},
    {"id": "body.expansion", "name": "扩展仓", "x": 50, "y": 80, "accepts": ["io", "other"]},
    {"id": "body.expansion_left", "name": "左扩展仓", "x": 39, "y": 81, "accepts": ["io", "other"]},
    {"id": "body.expansion_right", "name": "右扩展仓", "x": 61, "y": 81, "accepts": ["io", "other"]},
    {"id": "base.mobility", "name": "底盘", "x": 50, "y": 93, "accepts": ["mobility"]},
]


def _custom_board(raw: CustomBoard) -> BoardCard:
    return BoardCard(
        id=raw.id, name=raw.name, summary="用户自定义主控板", architecture="custom",
        brain_mode=raw.brain_mode, price_cny=raw.price_cny, base_power_w=raw.base_power_w,
        power_limit_w=raw.power_limit_w, ports=raw.ports,
        capabilities=tuple(raw.capabilities), color="#64748b",
        physical=raw.physical,
    )


def _custom_component(raw: CustomComponent) -> ComponentCard:
    return ComponentCard(
        id=raw.id, name=raw.name, category=raw.category, summary="用户自定义配件",
        price_cny=raw.price_cny, power_w=raw.power_w, requires_ports=raw.requires_ports,
        provides=tuple(raw.provides), compatible_slots=tuple(raw.compatible_slots),
        requires_board_capabilities=tuple(raw.requires_board_capabilities),
        power_output_w=raw.power_output_w, color="#64748b",
        physical=raw.physical,
    )


def get_catalog(assembly: HardwareAssembly | None = None) -> tuple[dict[str, BoardCard], dict[str, ComponentCard]]:
    boards = dict(BOARDS)
    components = dict(COMPONENTS)
    if assembly is not None:
        boards.update((b.id, _custom_board(b)) for b in assembly.custom_boards)
        components.update((c.id, _custom_component(c)) for c in assembly.custom_components)
    return boards, components


def board_to_dict(card: BoardCard) -> dict:
    out = asdict(card)
    out["capabilities"] = list(card.capabilities)
    out["physical"] = card.physical.model_dump()
    return out


def component_to_dict(card: ComponentCard) -> dict:
    out = asdict(card)
    out["provides"] = list(card.provides)
    out["compatible_slots"] = list(card.compatible_slots)
    out["requires_board_capabilities"] = list(card.requires_board_capabilities)
    out["physical"] = card.physical.model_dump()
    return out
