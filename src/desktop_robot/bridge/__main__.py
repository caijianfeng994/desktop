from __future__ import annotations

import argparse
import sys

from desktop_robot.bridge.backends import LogBackend
from desktop_robot.bridge.http_server import make_server


def main() -> None:
    parser = argparse.ArgumentParser(description="xiaozhi local REST bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--tts", choices=["none", "say"], default="none")
    args = parser.parse_args()

    tts_cmd: list[str] | None = None
    if args.tts == "say":
        if sys.platform == "darwin":
            tts_cmd = ["say", "-v", "Ting-Ting"]
        else:
            print("当前系统不是 macOS，--tts say 已忽略", file=sys.stderr)

    backend = LogBackend(tts_cmd=tts_cmd)
    server = make_server(args.host, args.port, backend)
    print(f"xiaozhi bridge http://{args.host}:{args.port}  (Ctrl+C 退出)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
        server.shutdown()


if __name__ == "__main__":
    main()
