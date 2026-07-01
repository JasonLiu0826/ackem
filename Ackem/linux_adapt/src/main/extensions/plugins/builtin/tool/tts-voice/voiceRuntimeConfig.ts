import * as OpenCC from 'opencc-js'
import type { InputChannel, VoiceMode } from './types'

let t2sConverter: ((text: string) => string) | null = null

function toSimplifiedChinese(text: string): string {
  if (!text) return text
  try {
    if (!t2sConverter) {
      t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })
    }
    return t2sConverter(text)
  } catch {
    return text
  }
}

/** Runtime voice settings synced from renderer Settings / theater. */

/** Set false until TTS broadcast ships in a future release. ASR / mic remain available. */
export const TTS_BROADCAST_ENABLED = false

/** Set false until GPT-SoVITS voice pack ships in a future release. Engine code remains wired. */
export const GPT_SOVITS_VOICE_ENABLED = false

export type VoiceRuntimeConfig = {
  enabled: boolean
  ttsEnabled: boolean
  asrModel: 'base' | 'small'
  ttsEngine: 'auto' | 'cosyvoice' | 'edge-tts' | 'local-sapi' | 'piper' | 'gpt-sovits'
  ttsVoice: 'xiaoxiao' | 'xiaoyi' | 'yunxi' | 'yunjian'
  ttsPiperModel: string
  ttsGptSovitsModel: string
  voiceMode: VoiceMode
  interruptThresholdMs: number
  silenceThresholdMs: number
  inputChannel: InputChannel
  personalityPresetId: string
}

export const DEFAULT_VOICE_RUNTIME_CONFIG: VoiceRuntimeConfig = {
  enabled: false,
  ttsEnabled: false,
  asrModel: 'base',
  ttsEngine: 'auto',
  ttsVoice: 'xiaoxiao',
  ttsPiperModel: '',
  ttsGptSovitsModel: '',
  voiceMode: 'vad',
  interruptThresholdMs: 500,
  silenceThresholdMs: 1000,
  inputChannel: 'dual',
  personalityPresetId: 'boy_next_door'
}

export function mergeVoiceRuntimeConfig(
  patch: Partial<VoiceRuntimeConfig>
): VoiceRuntimeConfig {
  return { ...DEFAULT_VOICE_RUNTIME_CONFIG, ...patch }
}

/** Strip markdown and convert to simplified Chinese before TTS. */
export function prepareTextForTts(text: string): string {
  return toSimplifiedChinese(stripMarkdownForTts(text))
}

/** Strip markdown / code blocks before TTS. */
export function stripMarkdownForTts(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[#*_~>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
