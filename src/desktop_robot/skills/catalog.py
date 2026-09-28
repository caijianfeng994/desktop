from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class SkillCard:
    id: str
    name: str
    summary: str
    effect_web: str
    effect_device: str
    grants: tuple[str, ...]
    is_chat_gate: bool = False
    origin: Literal["official", "huggingface", "github"] = "official"
    source_url: str = ""
    in_default_pack: bool = False
    requires_hardware: tuple[str, ...] = ()


def _official() -> dict[str, SkillCard]:
    return {
        "chat.base": SkillCard(
            id="chat.base",
            name="基础对话",
            summary="听懂并回答",
            effect_web="可以一来一回聊天",
            effect_device="真机上通过麦/喇叭对话",
            grants=("speak",),
            is_chat_gate=True,
            in_default_pack=True,
            requires_hardware=("audio.input", "audio.output"),
        ),
        "memory.base": SkillCard(
            id="memory.base",
            name="基础记忆",
            summary="明确说记住/忘掉才写入",
            effect_web="「叫我某某」会写入偏好；可忘掉",
            effect_device="同网页，记忆存在本机数据库",
            grants=("set_preference", "forget_preference"),
            in_default_pack=True,
        ),
        "memory.owner": SkillCard(
            id="memory.owner",
            name="记住主人",
            summary="强化称呼与短补充",
            effect_web="生成时把名字/补充句写入偏好，对话会带上",
            effect_device="同网页",
            grants=(),
            in_default_pack=True,
        ),
        "face.perform": SkillCard(
            id="face.perform",
            name="表情表演",
            summary="按情绪切脸",
            effect_web="对话页会换表情（开心/眨眼/惊讶等）",
            effect_device="屏幕显示对应表情",
            grants=("set_face",),
            in_default_pack=True,
            requires_hardware=("display.face",),
        ),
        "look.at_user": SkillCard(
            id="look.at_user",
            name="看看我",
            summary="「看看我/转过来」时转头",
            effect_web="3D 形象转头看你",
            effect_device="云台/舵机转向",
            grants=("look",),
            requires_hardware=("motion.servo.yaw",),
        ),
        "body.wave": SkillCard(
            id="body.wave",
            name="挥手打招呼",
            summary="「挥手/招手」时抬手挥一挥",
            effect_web="3D 形象挥手",
            effect_device="手臂舵机挥手",
            grants=("wave",),
            in_default_pack=True,
            requires_hardware=("motion.servo.arm",),
        ),
        "body.nod": SkillCard(
            id="body.nod",
            name="点头",
            summary="「点头」时点两下",
            effect_web="3D 形象点头",
            effect_device="云台点头",
            grants=("nod",),
            in_default_pack=True,
            requires_hardware=("motion.servo.pitch",),
        ),
        "body.hop": SkillCard(
            id="body.hop",
            name="小跳",
            summary="「跳一下」时原地蹦一下",
            effect_web="3D 形象原地小跳",
            effect_device="机身轻跳或动画",
            grants=("hop",),
            requires_hardware=("motion.hop",),
        ),
        "clock.tell": SkillCard(
            id="clock.tell",
            name="报时",
            summary="问现在几点",
            effect_web="机器人报当前时间",
            effect_device="同网页，语音播报",
            grants=("get_time",),
        ),
        "sense.listen": SkillCard(
            id="sense.listen",
            name="听一听",
            summary="用麦克风听你说话（浏览器语音识别）",
            effect_web="对话页出现麦克风，识别后当文字发送",
            effect_device="真机麦 + STT（可接 Whisper）",
            grants=("listen",),
            requires_hardware=("audio.input",),
        ),
        "voice.tts": SkillCard(
            id="voice.tts",
            name="说出来",
            summary="把回复读出声（浏览器语音合成）",
            effect_web="机器人回复会朗读；对应 HF Kokoro 等 TTS",
            effect_device="喇叭播报",
            grants=("tts",),
            requires_hardware=("audio.output",),
        ),
        "sense.see": SkillCard(
            id="sense.see",
            name="看一看",
            summary="「看看前面/你看到什么」时假装观察环境",
            effect_web="返回一段观察描述（假视觉）；可接摄像头 + VLM",
            effect_device="摄像头 + 视觉模型",
            grants=("see",),
            requires_hardware=("sensor.camera",),
        ),
        "persona.cheer": SkillCard(
            id="persona.cheer",
            name="元气应援",
            summary="说话偏鼓励",
            effect_web="回复风格偏应援",
            effect_device="同网页",
            grants=(),
            in_default_pack=True,
        ),
        "persona.roast": SkillCard(
            id="persona.roast",
            name="毒舌评委",
            summary="说话偏犀利但禁止辱骂",
            effect_web="回复风格偏毒舌",
            effect_device="同网页",
            grants=(),
        ),
        "persona.think": SkillCard(
            id="persona.think",
            name="慢热哲学家",
            summary="说话偏短、留白",
            effect_web="回复风格偏克制",
            effect_device="同网页",
            grants=(),
        ),
        "persona.argue": SkillCard(
            id="persona.argue",
            name="抬杠选手",
            summary="爱反问",
            effect_web="回复风格偏抬杠",
            effect_device="同网页",
            grants=(),
        ),
    }


def _online() -> dict[str, SkillCard]:
    """从 Hugging Face / GitHub 公开生态整理的可勾选技能（假 Body 先接线）。"""
    return {
        "online.hf.reachy_conversation": SkillCard(
            id="online.hf.reachy_conversation",
            name="Reachy 对话壳",
            summary="对齐 Pollen Reachy Mini Conversation：听-想-说状态与表情",
            effect_web="强化对话页状态机（倾听/思考/说话）与表情联动",
            effect_device="可迁到 Reachy Mini Spaces App",
            grants=("speak", "set_face"),
            origin="huggingface",
            source_url="https://huggingface.co/spaces/pollen-robotics/reachy_mini_conversation_app",
        ),
        "online.hf.reachy_hand_tracker": SkillCard(
            id="online.hf.reachy_hand_tracker",
            name="Reachy 跟手",
            summary="HF Hand Tracker：跟随手势转头看你",
            effect_web="解锁「看看我」同类转头表演",
            effect_device="摄像头跟手 → 云台",
            grants=("look",),
            origin="huggingface",
            source_url="https://huggingface.co/spaces/pollen-robotics/hand_tracker_v2",
            requires_hardware=("sensor.camera", "motion.servo.yaw"),
        ),
        "online.hf.kokoro_tts": SkillCard(
            id="online.hf.kokoro_tts",
            name="Kokoro 朗读",
            summary="HF hexgrad/Kokoro-82M 风格 TTS（本期先用浏览器朗读）",
            effect_web="回复自动朗读",
            effect_device="可换成本地/HF Kokoro 推理",
            grants=("tts",),
            origin="huggingface",
            source_url="https://huggingface.co/hexgrad/Kokoro-82M",
            requires_hardware=("audio.output",),
        ),
        "online.hf.whisper_stt": SkillCard(
            id="online.hf.whisper_stt",
            name="Whisper 听写",
            summary="HF Whisper 系 STT（本期先用浏览器语音识别）",
            effect_web="对话页麦克风听写",
            effect_device="可换 Whisper 本地/API",
            grants=("listen",),
            origin="huggingface",
            source_url="https://huggingface.co/models?pipeline_tag=automatic-speech-recognition&search=whisper",
            requires_hardware=("audio.input",),
        ),
        "online.hf.smolvlm_see": SkillCard(
            id="online.hf.smolvlm_see",
            name="SmolVLM 观察",
            summary="轻量视觉语言模型观察环境（本期假描述）",
            effect_web="「看看前面」返回观察话术",
            effect_device="摄像头 + SmolVLM2",
            grants=("see",),
            origin="huggingface",
            source_url="https://huggingface.co/models?search=SmolVLM",
            requires_hardware=("sensor.camera",),
        ),
        "online.hf.lerobot_hub": SkillCard(
            id="online.hf.lerobot_hub",
            name="LeRobot 预备",
            summary="Hugging Face LeRobot：真机模仿学习工具链（2 期）",
            effect_web="本期仅登记兴趣，不改对话步骤",
            effect_device="后续接 ACT/SmolVLA 策略",
            grants=(),
            origin="huggingface",
            source_url="https://huggingface.co/docs/lerobot/en/index",
        ),
        "online.github.reachy_mini": SkillCard(
            id="online.github.reachy_mini",
            name="Reachy Mini SDK",
            summary="GitHub pollen-robotics/reachy_mini 开源桌面机器人",
            effect_web="标记为 Reachy 兼容装配；表演技能可映射真机",
            effect_device="Python/JS SDK 控头与天线",
            grants=("nod", "wave"),
            origin="github",
            source_url="https://github.com/pollen-robotics/reachy_mini",
        ),
        "online.github.xiaozhi_esp32": SkillCard(
            id="online.github.xiaozhi_esp32",
            name="小智 ESP32 身体",
            summary="GitHub 78/xiaozhi-esp32 开源语音机器人固件",
            effect_web="标记可接本仓库小智 HTTP Body 桥",
            effect_device="ESP32-S3 麦/喇叭/表情屏",
            grants=("speak", "set_face"),
            origin="github",
            source_url="https://github.com/78/xiaozhi-esp32",
            requires_hardware=("audio.input", "audio.output", "display.face"),
        ),
        "online.github.smolagents": SkillCard(
            id="online.github.smolagents",
            name="smolagents 工具壳",
            summary="HF smolagents：把技能当 Tool 给 Agent 调",
            effect_web="本期登记；对话仍走现有 ConversationLoop",
            effect_device="可改为 CodeAgent + tools",
            grants=(),
            origin="github",
            source_url="https://github.com/huggingface/smolagents",
        ),
    }


CATALOG: dict[str, SkillCard] = {**_official(), **_online()}

DEFAULT_PACK: tuple[str, ...] = (
    "chat.base",
    "memory.base",
    "face.perform",
    "memory.owner",
    "body.wave",
    "body.nod",
    "persona.cheer",
)

MAX_INSTALLED = 14
CHAT_GATE_ID = "chat.base"

ORIGIN_LABEL = {
    "official": "官方",
    "huggingface": "Hugging Face",
    "github": "GitHub",
}


def list_catalog() -> list[SkillCard]:
    return list(CATALOG.values())


def list_official() -> list[SkillCard]:
    return [c for c in CATALOG.values() if c.origin == "official"]


def list_online() -> list[SkillCard]:
    return [c for c in CATALOG.values() if c.origin != "official"]


def card_to_dict(c: SkillCard) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "summary": c.summary,
        "effect_web": c.effect_web,
        "effect_device": c.effect_device,
        "is_chat_gate": c.is_chat_gate,
        "origin": c.origin,
        "origin_label": ORIGIN_LABEL.get(c.origin, c.origin),
        "source_url": c.source_url,
        "in_default_pack": c.in_default_pack,
        "grants": list(c.grants),
        "requires_hardware": list(c.requires_hardware),
    }


def grants_for(skill_ids: list[str]) -> frozenset[str]:
    out: set[str] = set()
    for sid in skill_ids:
        card = CATALOG.get(sid)
        if card is None:
            raise ValueError(f"未知技能: {sid}")
        out.update(card.grants)
    return frozenset(out)


def persona_ids(skill_ids: list[str]) -> list[str]:
    return [s for s in skill_ids if s.startswith("persona.")]
