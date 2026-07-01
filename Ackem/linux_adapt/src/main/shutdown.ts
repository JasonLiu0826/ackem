/**
 * 退出 Ackem 时统一关闭后台：语音 Python、调度器、微信通道、数据库等。
 */
import { app } from 'electron'
import { loadSettings } from './settings'
import { resolveDataRoot } from './paths'
import { closeAllDatabases } from './db/database'
import { createLogger } from './logger'
import {
  stopDesktopCompanionProactiveTimer,
  stopCompanionHarassScheduler
} from './extensions/plugins/builtin/desktop-companion/bootstrap'
import { stopDispatchScheduler } from './extensions/dispatch/scheduler'
import { stopMediaSessionPolling } from './mediaSession'
import { destroyPetWindow } from './petWindow'
import { getMinecraftProvider } from './ipc/shared'

const log = createLogger('shutdown')

let shutdownStarted = false
let shutdownFinished = false

export function isShutdownFinished(): boolean {
  return shutdownFinished
}

/** 退出前业务钩子：离线思绪、日记快照 */
export async function runExitPersistenceHooks(): Promise<void> {
  try {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const { runOfflineThoughtOnExit } = await import(
      './extensions/skills/builtin/offline-thought/onExit.js'
    )
    const count = await runOfflineThoughtOnExit(root, s.activeSessionId || 'default')
    if (count > 0) log.info('offline-thoughts generated on exit', { count })

    try {
      const { loadState, defaultFullState } = await import('./engine/state-persistence.js')
      const { defaultPersonalitySlice } = await import('./personalityPresets.js')
      const state =
        loadState(root, s.activeSessionId || 'default') ??
        defaultFullState(defaultPersonalitySlice(s))
      const { saveDiarySnapshotOnExit } = await import(
        './extensions/skills/builtin/diary-auto/dailyDiary.js'
      )
      saveDiarySnapshotOnExit(root, state, s)
    } catch {
      /* snapshot save failure is non-critical */
    }
  } catch (e) {
    log.error('exit persistence hooks failed', e)
  }
}

/** 关闭所有后台子进程与定时任务（可重复调用） */
export async function shutdownBackgroundServices(opts?: { closeDatabases?: boolean }): Promise<void> {
  stopDesktopCompanionProactiveTimer()
  stopCompanionHarassScheduler()
  stopDispatchScheduler()
  stopMediaSessionPolling()
  destroyPetWindow()

  try {
    const { stopVoiceService } = await import(
      './extensions/plugins/builtin/tool/tts-voice/bootstrap.js'
    )
    await stopVoiceService()
  } catch (e) {
    log.warn('voice service stop failed', { error: String(e) })
  }

  try {
    const { shutdownWeixinChannel } = await import('./ipc/weixin.js')
    await shutdownWeixinChannel()
  } catch (e) {
    log.warn('weixin shutdown failed', { error: String(e) })
  }

  try {
    await getMinecraftProvider()?.disconnect()
  } catch (e) {
    log.warn('minecraft disconnect failed', { error: String(e) })
  }

  if (opts?.closeDatabases !== false) {
    try {
      closeAllDatabases()
    } catch (e) {
      log.warn('database close failed', { error: String(e) })
    }
  }
}

/** 完整退出流程（before-quit / 卸载前） */
export async function performAppShutdown(): Promise<void> {
  if (shutdownFinished) return
  if (shutdownStarted) {
    while (!shutdownFinished) {
      await new Promise((r) => setTimeout(r, 50))
    }
    return
  }
  shutdownStarted = true
  ;(app as AppWithQuitFlags).isQuitting = true

  await runExitPersistenceHooks()
  await shutdownBackgroundServices()

  shutdownFinished = true
  log.info('app shutdown complete')
}

type AppWithQuitFlags = typeof app & { isQuitting?: boolean; shutdownComplete?: boolean }

export function markAppQuitting(): void {
  ;(app as AppWithQuitFlags).isQuitting = true
}
