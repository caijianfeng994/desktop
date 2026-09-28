from __future__ import annotations

import argparse
from pathlib import Path

from desktop_robot.llm.openai_compat import load_dotenv
from desktop_robot.studio.http_server import make_server


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="小小工坊 · 桌面机器人游戏与工程工作室")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", default="./data", help="护照与 db 根目录")
    args = parser.parse_args()
    data_root = Path(args.data)
    data_root.mkdir(parents=True, exist_ok=True)
    server = make_server(args.host, args.port, data_root)
    print(f"打开 http://{args.host}:{args.port}/ 进入小小工坊")
    print("工坊 / 改装 / 委托 / 伙伴 / 图鉴；工程入口 /?home=1")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
