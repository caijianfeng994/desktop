# 小智 Body 冒烟步骤

1. 按 https://github.com/78/xiaozhi-esp32 刷 ESP32-S3 固件并联网。
2. 启动本地桥（自行用 py-xiaozhi/MCP 转发到 REST）：
   - `POST /v1/speak` `{"text":"..."}`
   - `POST /v1/face` `{"face":"..."}`
   - `POST /v1/look` `{"yaw":20,"pitch":0}`
3. 本仓库：

```bash
python -m desktop_robot --body xiaozhi --body-url http://127.0.0.1:8787
```

4. 输入「你好」，确认机身出声/表情。
