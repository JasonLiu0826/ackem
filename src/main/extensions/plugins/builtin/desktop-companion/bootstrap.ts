// [desktop-companion/bootstrap] — 应用壳层生命周期：实例化、在场桥接、主动消息定时器

import type { BrowserWindow } from 'electron'
import { DesktopCompanion } from './desktop-companion'
import { setCompanionInstance } from './ipc'
import {
  setCompanionHarassMainWindowGetter,
  startCompanionHarassScheduler,
  stopCompanionHarassScheduler,
  syncCompanionHarassScheduler
} from './companionHarassScheduler'
import {
  startUnifiedProactiveScheduler,
  stopUnifiedProactiveScheduler,
  syncUnifiedProactiveScheduler,
} from '../../../../companion/proactiveScheduler'

let desktopCompanion: DesktopCompanion | null = null
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

/** v1.1.0 统一主动问候调度（频率池 + 展示模式） */
export function startDesktopCompanionProactiveTimer(getMainWindow: () => BrowserWindow | null): void {
  bindProactiveMainWindowGetter(getMainWindow)
  startUnifiedProactiveScheduler(getMainWindow)
}

export function stopDesktopCompanionProactiveTimer(): void {
  stopUnifiedProactiveScheduler()
}

export { syncUnifiedProactiveScheduler }

export {
  startCompanionHarassScheduler,
  stopCompanionHarassScheduler,
  syncCompanionHarassScheduler
}

export function bootCompanionHarassScheduler(): void {
  startCompanionHarassScheduler()
}
