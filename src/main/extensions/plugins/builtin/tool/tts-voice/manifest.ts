import type { PluginManifest } from '../../../types'

export const TTS_VOICE_PLUGIN_ID = 'Ackem/voice-pipeline@0.1.0'

export const TTS_VOICE_MANIFEST: PluginManifest = {
  id: TTS_VOICE_PLUGIN_ID,
  name: '璇煶绠＄嚎',
  version: '0.1.0',
  category: 'plugin',
  pluginType: 'tool',
  implementationStatus: 'dev',
  description:
    '璇煶瀵硅瘽绠＄嚎锛欰SR (faster-whisper) + TTS (CosyVoice/edge-tts) + 鎯呯华鎸囦护鏄犲皠銆傚墽闄㈡ā寮忎笅鍗婂弻宸ヨ闊冲璇濄€?,
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
    scenarios: ['鍓ч櫌妯″紡璇煶瀵硅瘽', 'TTS 鏈楄 AI 鍥炲'],
    summary: '璇煶绠＄嚎锛欰SR 璇煶璇嗗埆 + TTS 璇煶鍚堟垚 + 鎯呯华椹卞姩',
    keywords: ['璇煶', 'tts', 'asr', '鏈楄', '璇磋瘽', 'voice']
  }
}

export const PLUGIN_ID = TTS_VOICE_PLUGIN_ID
export const SPEC_ID = 'P-04'
export const MANIFEST = TTS_VOICE_MANIFEST
