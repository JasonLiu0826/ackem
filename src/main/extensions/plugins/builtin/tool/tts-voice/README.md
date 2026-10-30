# 语音管线（voice-pipeline / P-04）

- **类型**：Plugin / `tool` / `manual`
- **ID**：`ackem/voice-pipeline@0.1.0`
- **状态**：本地 sherpa-onnx 识别已接线（TTS 播报仍灰度）

## 能力

| 能力 | 状态 |
|------|------|
| sherpa-onnx 流式 ASR（标准档） | ✅ sidecar worker，模型在 userData |
| 主聊天 / 工作页 / 剧院共用一个识别口 | ✅ 同时只开一个麦 |
| Settings 语音配置页 | ✅ 下载并安装标准档 |
| 双通道识别结果可编辑 | ✅ dual 模式填入输入框 |
| TTS 自动播报回复 | 灰度关闭 |

## IPC

- `voice:audio-chunk` / `voice:transcript` / `voice:transcript-partial`
- `voice:set-mode` / `voice:apply-settings` / `voice:restart-service`
- `voice:check-environment` / `voice:install-environment`

## 启用

1. Settings → 语音 → **下载并安装标准档**（已下过可跳过）
2. 打开 **启用语音功能**
3. 主聊天或工作页点麦克风说话
