/** 解耦 context 与 DesktopCompanion 实例（避免循环依赖） */

import type { CompanionRuntimeContext } from './types'

export type CompanionPresenceSnapshot = {
  mode: 'active' | 'quiet' | 'sleeping'
  lastInteractionMs: number
  idleDurationMs: number
}

let provider: (() => CompanionPresenceSnapshot | null) | null = null

export function setCompanionPresenceProvider(fn: (() => CompanionPresenceSnapshot | null) | null): void {
  provider = fn
}

export function readCompanionPresence(): CompanionRuntimeContext {
  const snap = provider?.()
  if (!snap) {
    const now = Date.now()
    return {
      mode: 'active',
      lastInteractionMs: now,
      idleDurationMs: 0
    }
  }
  return {
    mode: snap.mode,
    lastInteractionMs: snap.lastInteractionMs,
    idleDurationMs: snap.idleDurationMs
  }
}
