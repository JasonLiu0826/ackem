# 语音管线（voice-pipeline / P-04）

- **类型**：Plugin / `tool` / `manual`
- **ID**：`ackem/voice-pipeline@0.1.0`
- **状态**：开发中（Python 服务 + Electron 端到端已接线）

## 能力

| 能力 | 状态 |
|------|------|
| Python ASR/TTS HTTP 服务 | ✅ |
| 剧院模式麦克风 + VAD 缓冲 ASR | ✅ |
| LLM 回复后情绪 TTS | ✅（`postChatTurn` → `voiceManager.speak`） |
| Settings 语音配置页 | ✅ |
| 双通道识别结果可编辑 | ✅（dual 模式填入输入框） |
| PTT 按住说话 | ✅（剧院麦克风按住） |
| 嵌入式 Python 零配置打包 | ⏳ `package-python.ps1` |

## IPC

- `voice:audio-chunk` / `voice:transcript` / `voice:tts-audio`
- `voice:set-mode` / `voice:apply-settings` / `voice:restart-service`
- `ext:tts:speak` → 语音管线活跃时走 TTS，否则系统通知降级

## 启用

1. Settings → 语音 → **启用语音功能**
2. 确保 `Ackem/voice-service` 依赖已安装（`pip install -r requirements.txt`）
3. 剧院模式开麦 → 说话 → 等待 ASR → 回复自动 TTS
