export type VoiceSettingsState = {
  enabled: boolean
  asrModel: 'base' | 'small'
  ttsEngine: 'auto' | 'cosyvoice' | 'edge-tts' | 'local-sapi' | 'piper' | 'gpt-sovits'
  ttsVoice: 'xiaoxiao' | 'xiaoyi' | 'yunxi' | 'yunjian'
  ttsPiperModel: string
  ttsGptSovitsModel: string
  ttsEnabled: boolean
  ttsVolume: number
  voiceMode: 'vad' | 'ptt'
  interruptThreshold: number
  silenceThreshold: number
  rememberMicState: boolean
  inputChannel: 'dual' | 'voice-only' | 'text-only'
}

export const VOICE_SETTINGS_STORAGE_KEY = 'Ackem-voice-settings'

/** Reserved for future release 鈥?mirrors voiceRuntimeConfig.GPT_SOVITS_VOICE_ENABLED */
export const GPT_SOVITS_VOICE_ENABLED = false

/** TTS reply playback grayed out; mic / ASR still work. */
export const TTS_BROADCAST_ENABLED = false

export const DEFAULT_VOICE_SETTINGS: VoiceSettingsState = {
  enabled: false,
  asrModel: 'base',
  ttsEngine: 'auto',
  ttsVoice: 'xiaoxiao',
  ttsPiperModel: '',
  ttsGptSovitsModel: '',
  ttsEnabled: false,
  ttsVolume: 80,
  voiceMode: 'vad',
  interruptThreshold: 500,
  silenceThreshold: 1000,
  rememberMicState: true,
  inputChannel: 'dual'
}

export function loadVoiceSettings(): VoiceSettingsState {
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY)
    if (raw) {
      const parsed = { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(raw) } as VoiceSettingsState
      if (!GPT_SOVITS_VOICE_ENABLED && parsed.ttsEngine === 'gpt-sovits') {
        parsed.ttsEngine = 'auto'
      }
      if (!TTS_BROADCAST_ENABLED) {
        parsed.ttsEnabled = false
      }
      return parsed
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_VOICE_SETTINGS }
}

export function saveVoiceSettings(s: VoiceSettingsState): void {
  localStorage.setItem(VOICE_SETTINGS_STORAGE_KEY, JSON.stringify(s))
}

/** Sync renderer settings to main-process voiceManager. */
export async function syncVoiceSettingsToMain(
  settings: VoiceSettingsState,
  personalityPresetId?: string
): Promise<void> {
  await window.Ackem.voice?.applySettings?.({
    enabled: settings.enabled,
    ttsEnabled: TTS_BROADCAST_ENABLED ? settings.ttsEnabled : false,
    asrModel: settings.asrModel,
    ttsEngine: settings.ttsEngine,
    ttsVoice: settings.ttsVoice,
    ttsPiperModel: settings.ttsPiperModel,
    ttsGptSovitsModel: settings.ttsGptSovitsModel,
    voiceMode: settings.enabled ? settings.voiceMode : 'off',
    interruptThresholdMs: settings.interruptThreshold,
    silenceThresholdMs: settings.silenceThreshold,
    inputChannel: settings.inputChannel,
    personalityPresetId
  })
}
