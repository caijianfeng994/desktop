# 小智 Body 冒烟步骤

无 ESP32 时也可先跑通 HTTP 契约（本机桥用日志 + 可选 macOS `say`）。

## 1. 起本地桥

```bash
python -m desktop_robot.bridge --host 127.0.0.1 --port 8787 --tts say
```

`--tts say` 仅 macOS 有效；其它系统用 `--tts none`。

桥路由：

- `POST /v1/speak` `{"text":"..."}`
- `POST /v1/face` `{"face":"..."}`
- `POST /v1/look` `{"yaw":20,"pitch":0}`

## 2. 另开终端跑 Brain

```bash
python -m desktop_robot --body xiaozhi --body-url http://127.0.0.1:8787
```

输入「你好」，桥终端应出现 `speak` / `set_face` 日志；macOS 开了 `--tts say` 会出声。

## 3. 实机（后续）

按 https://github.com/78/xiaozhi-esp32 刷固件并联网后，把 `LogBackend` 换成 py-xiaozhi/MCP 转发即可；REST 路径保持不变。
