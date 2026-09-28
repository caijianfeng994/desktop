#!/usr/bin/env python3
"""Deep Agent：加载 skills/image-to-3d，用团队网关模型调试。

默认用「视频模型 guide」无花费联调 Image Skill CLI；
确认链路后再切到 Trellis 图生 3D。

文档：https://docs.langchain.com/oss/python/deepagents/skills
Skill 来源：aiskillstore image-to-3d / Image Skill (fal.trellis-image-to-3d)

用法：
  # 无花费：视频模型 guide 调试
  .venv/bin/python agent.py --mode video-guide

  # 图生 3D guide（仍默认 no-spend）
  .venv/bin/python agent.py --mode image-to-3d

  # 自定义任务
  .venv/bin/python agent.py -m "先跑视频 guide，总结 data.stage 和 next_command"
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver

ROOT = Path(__file__).resolve().parent


def load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def build_model() -> ChatOpenAI:
    """用 AI Gateway（OpenAI 兼容）作为 Deep Agent 调试模型。"""
    api_key = (
        os.getenv("AI_GATEWAY_API_KEY")
        or os.getenv("LLM_API_KEY")
        or ""
    ).strip()
    base_url = (
        os.getenv("AI_GATEWAY_BASE_URL")
        or os.getenv("LLM_BASE_URL")
        or "https://ops-ai-gateway.yc345.tv/v1"
    ).strip().rstrip("/")
    model = (
        os.getenv("AI_GATEWAY_MODEL")
        or os.getenv("LLM_MODEL")
        or "deepseek-v4-pro"
    ).strip()
    if not api_key:
        raise SystemExit(
            "未配置 AI_GATEWAY_API_KEY（或 LLM_API_KEY）。请写入 .env 后再跑。"
        )
    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=model,
        temperature=0.2,
    )


def default_message(mode: str) -> str:
    avatar = "src/desktop_robot/studio/static/robot-avatar.png"
    if mode == "video-guide":
        return (
            "请启用 image-to-3d skill。先用视频模型做无花费调试：\n"
            "1) 阅读 skills/image-to-3d/SKILL.md 与 references/cli-workflow.md\n"
            "2) 运行 skills/image-to-3d/scripts/run_image_skill.py --mode video-guide\n"
            "   （模型 fal.ltx-video-13b-distilled）\n"
            "3) 总结 data.stage、next_command、是否 ready、有无花费风险\n"
            "4) 不要执行任何会扣费的 live create，除非我明确允许\n"
        )
    return (
        "请启用 image-to-3d skill，准备把机器人形象做成 GLB：\n"
        f"参考图：{avatar}\n"
        "1) 阅读 SKILL.md\n"
        "2) 先跑 scripts/run_image_skill.py --mode image-to-3d-guide（无花费）\n"
        "3) 汇报 stage / next_command；若需 auth 或充值，说明步骤\n"
        "4) 未获允许前不要执行 live edit/create（fal.trellis-image-to-3d）\n"
    )


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="desktop-robot Deep Agent")
    parser.add_argument(
        "--mode",
        choices=["video-guide", "image-to-3d"],
        default="video-guide",
        help="video-guide=用视频模型调试 CLI；image-to-3d=Trellis 图生 3D guide",
    )
    parser.add_argument("-m", "--message", default=None, help="覆盖默认用户任务")
    parser.add_argument(
        "--thread-id",
        default="desktop-robot-image-to-3d",
        help="LangGraph thread_id",
    )
    args = parser.parse_args()

    backend = FilesystemBackend(root_dir=str(ROOT), virtual_mode=True)
    # skills 路径相对 backend root；必须指向「含各 skill 子目录」的容器
    agent = create_deep_agent(
        model=build_model(),
        backend=backend,
        skills=["./skills/"],
        system_prompt=(
            "你是 desktop-robot 的媒体资产助手。"
            "严格遵循 skills 中的 image-to-3d 说明："
            "先 no-spend guide，再考虑花费；调试优先视频模型。"
            "用中文简要汇报。"
        ),
        checkpointer=MemorySaver(),
        name="desktop-robot-media-agent",
        debug=True,
    )

    content = args.message or default_message(args.mode)
    print(f"[agent] mode={args.mode} model={os.getenv('AI_GATEWAY_MODEL') or 'deepseek-v4-pro'}")
    print(f"[agent] task:\n{content}\n---")

    result = agent.invoke(
        {"messages": [{"role": "user", "content": content}]},
        config={"configurable": {"thread_id": args.thread_id}},
    )

    messages = result.get("messages") or []
    if not messages:
        print(result)
        return
    last = messages[-1]
    text = getattr(last, "content", None) or last.get("content") if isinstance(last, dict) else str(last)
    print(text)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
