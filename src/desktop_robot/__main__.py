from __future__ import annotations

import argparse
import uuid
from pathlib import Path

import httpx

from desktop_robot.body.fake import FakeBody
from desktop_robot.body.xiaozhi_http import XiaozhiHttpBody
from desktop_robot.brain.loop import ConversationLoop
from desktop_robot.learn.engine import LearnEngine
from desktop_robot.memory.store import MemoryStore


def main() -> None:
    parser = argparse.ArgumentParser(description="desktop-robot REPL")
    parser.add_argument("--db", default="./data/robot.db")
    parser.add_argument("--body", choices=["fake", "xiaozhi"], default="fake")
    parser.add_argument("--body-url", default="http://127.0.0.1:8787")
    args = parser.parse_args()

    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    store = MemoryStore(args.db)
    if args.body == "fake":
        body = FakeBody()
    else:
        body = XiaozhiHttpBody(client=httpx.Client(base_url=args.body_url, timeout=10.0))

    loop = ConversationLoop(store=store, body=body, learn=LearnEngine(store, explore_prob=0.1))
    session_id = str(uuid.uuid4())
    print("desktop-robot REPL（空行退出）")
    while True:
        try:
            line = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            break
        result = loop.run_turn(line, session_id=session_id)
        print(
            f"intent={result.intent} steps={'+'.join(result.steps)} "
            f"ok={result.ok} reason={result.reason!r} reply={result.reply!r}"
        )
        facts = store.list_facts()
        if facts:
            print(f"facts={facts}")


if __name__ == "__main__":
    main()
