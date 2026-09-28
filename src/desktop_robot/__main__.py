from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

import httpx

from desktop_robot.body.fake import FakeBody
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.llm.openai_compat import OpenAICompatLLM, load_dotenv
from desktop_robot.memory.store import MemoryStore
from desktop_robot.passport.store import load_passport


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="desktop-robot REPL")
    parser.add_argument("--db", default="./data/robot.db")
    parser.add_argument("--body", choices=["fake", "xiaozhi"], default="fake")
    parser.add_argument("--body-url", default="http://127.0.0.1:8787")
    parser.add_argument(
        "--passport",
        default=None,
        help="护照 JSON；有则按已装技能过滤步骤；draft 无法开聊",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="同时打印 intent / steps 调试信息",
    )
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="禁用大模型，仅用规则回复",
    )
    args = parser.parse_args()

    passport = None
    if args.passport:
        passport = load_passport(Path(args.passport))
        if passport.status == "draft":
            print("至少安装「基础对话」才能开始聊天。", file=sys.stderr)
            raise SystemExit(1)

    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    store = MemoryStore(args.db)
    if args.body == "fake":
        body = FakeBody()
    else:
        body = XiaozhiHttpBody(client=httpx.Client(base_url=args.body_url, timeout=10.0))

    llm = OpenAICompatLLM()
    use_llm = not args.no_llm
    label = passport.name if passport else "desktop-robot"
    if use_llm and llm.available:
        print(f"{label}（LLM 已接通：{llm.model}，空行退出）")
    elif use_llm and not llm.available:
        print(f"{label}（未配置 API Key，规则模式；空行退出）")
    else:
        print(f"{label}（规则模式；空行退出）")

    loop = ConversationLoop(
        store=store,
        body=body,
        learn=LearnEngine(store, explore_prob=0.1),
        passport=passport,
        llm=llm,
        use_llm=use_llm,
    )
    session_id = str(uuid.uuid4())
    while True:
        try:
            line = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            break
        result = loop.run_turn(line, session_id=session_id)
        print(f"{label}: {result.reply}")
        if args.verbose:
            print(
                f"  [debug] intent={result.intent} steps={'+'.join(result.steps)} "
                f"ok={result.ok} reason={result.reason!r}"
            )
            facts = store.list_facts()
            if facts:
                print(f"  [debug] facts={facts}")


if __name__ == "__main__":
    main()
