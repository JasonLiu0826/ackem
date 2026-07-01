import type { PluginManifest } from '../../../types'

export const TTS_VOICE_PLUGIN_ID = 'ackem/voice-pipeline@0.1.0'

export const TTS_VOICE_MANIFEST: PluginManifest = {
  id: TTS_VOICE_PLUGIN_ID,
  name: '语音管线',
  version: '0.1.0',
  category: 'plugin',
  pluginType: 'tool',
  implementationStatus: 'dev',
  description:
    '语音对话管线：ASR (faster-whisper) + TTS (CosyVoice/edge-tts) + 情绪指令映射。剧院模式下半双工语音对话。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'bootstrap.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['readonly', 'network'],
  fallbackPermissions: ['readonly', 'network'],
  tags: ['builtin', 'voice', 'asr', 'tts', 'w8'],
  dispatch: {
    mode: 'manual',
    time: { manual_trigger: true },
    habits: [],
    scenarios: ['剧院模式语音对话', 'TTS 朗读 AI 回复'],
    summary: '语音管线：ASR 语音识别 + TTS 语音合成 + 情绪驱动',
    keywords: ['语音', 'tts', 'asr', '朗读', '说话', 'voice']
  }
}

export const PLUGIN_ID = TTS_VOICE_PLUGIN_ID
export const SPEC_ID = 'P-04'
export const MANIFEST = TTS_VOICE_MANIFEST
