/**
 * [voice-pipeline] Plugin bootstrap 鈥?Python service lifecycle + IPC registration.
 *
 * Starts the Python voice service on plugin load, stops on unload.
 * Registers voiceManager IPC handlers for renderer communication.
 */

import { Notification } from 'electron'
import { voiceService, type ServiceState, type VoiceServiceStartOptions } from './pythonService'
import { voiceManager } from './voiceManager'

export type { ServiceState }

/** Register voice IPC handlers (idempotent). Safe before plugin onLoad / engine snapshot. */
export function ensureVoiceIpc(): void {
  voiceManager.registerIpc()
}

/** Start Python voice service. IPC registered first so Settings can query health immediately. */
export async function startVoiceService(opts?: VoiceServiceStartOptions): Promise<boolean> {
  ensureVoiceIpc()

  const ttsEngine = opts?.ttsEngine ?? voiceManager.runtimeConfig.ttsEngine
  const ok = await voiceService.start({ ttsEngine })
  if (ok) {
    console.log('[voice-pipeline] service started, IPC registered')
  }
  return ok
}

/** Stop Python voice service + unregister IPC. Called by plugin onUnload. */
export async function stopVoiceService(): Promise<void> {
  voiceManager.unregisterIpc()
  await voiceService.stop()
  console.log('[voice-pipeline] service stopped, IPC unregistered')
}

/** Get current service state. */
export function getVoiceServiceState(): ServiceState {
  return voiceService.currentState
}

/**
 * Backward-compatible entry 鈥?delegates to voiceManager when pipeline is active.
 */
export function speakViaNotification(text: string): {
  ok: boolean
  mode: string
  implementationStatus: string
  error?: string
} {
  const body = text.trim().slice(0, 2000)
  if (!body) {
    return { ok: false, mode: 'none', implementationStatus: 'dev', error: 'empty_text' }
  }

  if (voiceManager.currentMode !== 'off') {
    void voiceManager.speak(body, 'CALM_RATIONAL')
    return { ok: true, mode: 'voice_pipeline', implementationStatus: 'dev' }
  }

  if (!Notification.isSupported()) {
    return { ok: false, mode: 'none', implementationStatus: 'dev', error: 'notifications_unsupported' }
  }
  const n = new Notification({
    title: 'Ackem 路 璇煶',
    body: body.slice(0, 200),
    silent: false
  })
  n.show()
  return { ok: true, mode: 'notification', implementationStatus: 'dev' }
}
