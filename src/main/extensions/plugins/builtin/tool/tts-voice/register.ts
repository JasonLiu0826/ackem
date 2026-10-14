import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { ensureVoiceIpc, stopVoiceService } from './bootstrap'
import { TTS_VOICE_MANIFEST, TTS_VOICE_PLUGIN_ID } from './manifest'

export async function registerBuiltinTtsVoice(registry: PluginRegistry): Promise<void> {
  ensureVoiceIpc()

  const reg = await registry.registerBuiltin(TTS_VOICE_MANIFEST, {
    onLoad: async () => {
      ensureVoiceIpc()
      return { ok: true as const }
    },
    onUnload: async () => {
      await stopVoiceService()
      return { ok: true as const }
    }
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '语音插件注册失败')
  }
  await ensurePluginActive(registry, TTS_VOICE_PLUGIN_ID)
}

/** IPC only. Sherpa starts when the user enables the mic. */
export async function ensureVoicePipelineRuntime(): Promise<void> {
  ensureVoiceIpc()
}
