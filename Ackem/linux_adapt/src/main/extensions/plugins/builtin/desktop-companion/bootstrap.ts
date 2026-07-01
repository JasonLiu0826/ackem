// [desktop-companion/bootstrap] — 应用壳层生命周期：实例化、在场桥接、主动消息定时器

import type { BrowserWindow } from 'electron'
import { createLogger } from '../../../../logger'
import { loadSettings } from '../../../../settings'
import { resolveDataRoot } from '../../../../paths'
import { DesktopCompanion, getTimeContext } from './desktop-companion'
import { setCompanionInstance } from './ipc'
import {
  deliverCompanionProactiveMessage,
  setCompanionHarassMainWindowGetter,
  startCompanionHarassScheduler,
  stopCompanionHarassScheduler,
  syncCompanionHarassScheduler
} from './companionHarassScheduler'

const log = createLogger('desktop-companion-bootstrap')

let desktopCompanion: DesktopCompanion | null = null
let proactiveTimer: ReturnType<typeof setInterval> | null = null
let proactiveMainWindowGetter: (() => BrowserWindow | null) | null = null

export function getDesktopCompanion(): DesktopCompanion | null {
  return desktopCompanion
}

export function touchDesktopCompanion(): void {
  desktopCompanion?.touch()
}

/** 初始化桌面陪伴实例并接入 RuntimeContext 桥接 */
export async function initDesktopCompanion(): Promise<DesktopCompanion> {
  desktopCompanion = new DesktopCompanion()
  setCompanionInstance(desktopCompanion)

  const { setCompanionPresenceProvider } = await import('../../../../context/companionBridge.js')
  setCompanionPresenceProvider(() => {
    if (!desktopCompanion) return null
    const p = desktopCompanion.getPresence()
    return {
      mode: p.mode,
      lastInteractionMs: p.lastInteractionMs,
      idleDurationMs: p.idleDurationMs
    }
  })

  return desktopCompanion
}

function bindProactiveMainWindowGetter(getMainWindow: () => BrowserWindow | null): void {
  proactiveMainWindowGetter = getMainWindow
  setCompanionHarassMainWindowGetter(getMainWindow)
}

/** 每 30 秒检查是否生成主动消息（桌面通知 + 聊天历史 + UI push） */
export function startDesktopCompanionProactiveTimer(getMainWindow: () => BrowserWindow | null): void {
  bindProactiveMainWindowGetter(getMainWindow)
  if (proactiveTimer) clearInterval(proactiveTimer)

  proactiveTimer = setInterval(async () => {
    if (!desktopCompanion) return
    const mainWindow = proactiveMainWindowGetter?.() ?? null
    if (!mainWindow) return

    try {
      const s = loadSettings()
      const root = resolveDataRoot(s)
      const { loadState, defaultFullState } = await import('../../../../engine/state-persistence.js')
      const { defaultPersonalitySlice } = await import('../../../../personalityPresets.js')
      const state =
        loadState(root, s.activeSessionId || 'default') ??
        defaultFullState(defaultPersonalitySlice(s))

      let recentFact: string | undefined
      try {
        const { FactStore, defaultFactsPath } = await import('../../../../memory/factStore.js')
        const store = new FactStore(defaultFactsPath(root))
        store.load()
        const active = store.listActive()
        if (active.length > 0) {
          const sorted = [...active].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          recentFact = sorted[0].summary.slice(0, 40)
        }
      } catch {
        /* non-critical */
      }

      const result = await desktopCompanion.tryGenerateProactive(state.relationship, state.emotion, {
        settings: s,
        recentFact
      })
      if (!result) return

      deliverCompanionProactiveMessage({
        mainWindow,
        message: result.message,
        timeContext: result.timeContext
      })
    } catch (e) {
      log.error('proactive timer error', e)
    }
  }, 30_000)
}

export function stopDesktopCompanionProactiveTimer(): void {
  if (proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = null
  }
}

export {
  startCompanionHarassScheduler,
  stopCompanionHarassScheduler,
  syncCompanionHarassScheduler
}

export function bootCompanionHarassScheduler(): void {
  startCompanionHarassScheduler()
}
