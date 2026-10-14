/**
 * Voice pipeline bootstrap — IPC + sherpa sidecar. No Python service.
 */

import { Notification } from 'electron'
import { voiceManager } from './voiceManager'

/** Register voice IPC handlers (idempotent). Safe before plugin onLoad / engine snapshot. */
export function ensureVoiceIpc(): void {
  voiceManager.registerIpc()
}

export async function startVoiceService(): Promise<boolean> {
  ensureVoiceIpc()
  return true
}

export async function stopVoiceService(): Promise<void> {
  voiceManager.unregisterIpc()
  await voiceManager.disposeRecognizer()
  console.log('[voice-pipeline] sherpa stopped, IPC unregistered')
}

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
    title: 'Ackem · 语音',
    body: body.slice(0, 200),
    silent: false
  })
  n.show()
  return { ok: true, mode: 'notification', implementationStatus: 'dev' }
}
