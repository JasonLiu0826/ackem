import type { PluginRegistry } from '../../../registry'
import { ensurePluginActive } from '../../ensurePluginActive'
import { ensureVoiceIpc, startVoiceService, stopVoiceService } from './bootstrap'
import { voiceService } from './pythonService'
import { checkVoiceEnvironment } from './voiceEnvironment'
import { TTS_VOICE_MANIFEST, TTS_VOICE_PLUGIN_ID } from './manifest'

async function shouldAutoStartVoiceService(): Promise<boolean> {
  const env = await checkVoiceEnvironment()
  return env.python.ok && env.dependenciesOk && env.scriptOk
}

export async function registerBuiltinTtsVoice(registry: PluginRegistry): Promise<void> {
  // IPC must exist even when activate() runs before engineSnapshot (onLoad skipped).
  ensureVoiceIpc()

  const reg = await registry.registerBuiltin(TTS_VOICE_MANIFEST, {
    onLoad: async () => {
      if (!(await shouldAutoStartVoiceService())) {
        console.log('[voice-pipeline] env not ready, skip auto-start (Settings → 语音)')
        return { ok: true }
      }
      const ok = await startVoiceService()
      return ok ? { ok: true } : { ok: false, error: 'Voice service failed to start' }
    },
    onUnload: async () => {
      await stopVoiceService()
      return { ok: true as const }
    }
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? 'TTS 插件注册失败')
  }
  await ensurePluginActive(registry, TTS_VOICE_PLUGIN_ID)
}

/**
 * Plugins activated before engineSnapshot may skip onLoad while still marked active.
 * Call after coordinator.updateSnapshot() to start Python voice service.
 */
export async function ensureVoicePipelineRuntime(): Promise<void> {
  ensureVoiceIpc()
  if (voiceService.currentState === 'ready' || voiceService.currentState === 'starting') return
  if (!(await shouldAutoStartVoiceService())) {
    console.log('[voice-pipeline] env not ready, skip deferred start (Settings → 语音)')
    return
  }
  const ok = await startVoiceService()
  if (!ok) {
    console.warn('[voice-pipeline] deferred Python service start failed (Settings → 重启语音服务)')
  }
}
