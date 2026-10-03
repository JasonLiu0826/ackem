import type { BrowserWindow } from 'electron'
import { createLogger } from '../logger'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { engineSessionId } from '../session/canonical'
import { composeCompanionProactiveMessage } from './proactiveCompose'
import { loadState, saveState } from '../engine/state-persistence'
import { deliverCompanionProactiveMessage } from '../extensions/plugins/builtin/desktop-companion/companionHarassScheduler'
import { mirrorProactiveToWeixin } from '../channels/weixin/mirrorOutbound'
import { randomUUID } from 'node:crypto'

const log = createLogger('proactive-scheduler')

const INTERVAL_POOLS = {
  high: [60_000, 120_000, 300_000, 600_000],
  medium: [600_000, 1_200_000, 1_800_000],
  low: [1_800_000, 3_600_000, 7_200_000, 10_800_000],
} as const

let timer: ReturnType<typeof setTimeout> | null = null
let ticking = false
let mainWindowGetter: (() => BrowserWindow | null) | null = null
let lastUserActivityMs = Date.now()

export function setProactiveMainWindowGetter(fn: () => BrowserWindow | null): void {
  mainWindowGetter = fn
}

export function touchProactiveUserActivity(): void {
  lastUserActivityMs = Date.now()
}

function pickIntervalMs(freq: 'low' | 'medium' | 'high'): number {
  const pool = INTERVAL_POOLS[freq]
  return pool[Math.floor(Math.random() * pool.length)]!
}

function scheduleNextTick(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const settings = loadSettings()
  if (settings.proactiveEnabled === false) return

  const freq = settings.proactiveFrequency ?? 'medium'
  const delayMs = pickIntervalMs(freq)
  timer = setTimeout(() => {
    void tickProactive().finally(scheduleNextTick)
  }, delayMs)
  log.debug('proactive next tick', { freq, delayMs })
}

async function tickProactive(): Promise<void> {
  if (ticking) return
  ticking = true
  try {
    const settings = loadSettings()
    if (settings.proactiveEnabled === false) return

    const quietMs = settings.proactiveUserQuietMs ?? 60_000
    if (Date.now() - lastUserActivityMs < quietMs) {
      log.debug('proactive deferred — user recently active')
      return
    }

    const mainWindow = mainWindowGetter?.() ?? null
    const root = resolveDataRoot(settings)
    const sessionId = engineSessionId()

    const composed = await composeCompanionProactiveMessage({
      dataRoot: root,
      settings,
      sessionId,
      harass: false,
    })
    if (!composed?.raw?.trim()) return

    const state = loadState(root, sessionId)
    if (state) {
      state.counters.totalTurns = (state.counters?.totalTurns ?? 0) + 1
      saveState(root, state, sessionId)
    }

    const displayMode = settings.proactiveDisplayMode ?? 'both'
    const proactiveId = randomUUID()

    if (displayMode !== 'chat_only') {
      deliverCompanionProactiveMessage({
        mainWindow,
        message: composed.raw,
        source: 'idle',
        displayMode,
        proactiveId,
        skipChatAppend: displayMode === 'notify_only',
      })
    } else {
      deliverCompanionProactiveMessage({
        mainWindow,
        message: composed.raw,
        source: 'idle',
        displayMode: 'chat_only',
        proactiveId,
      })
    }

    if (settings.weixinChannelEnabled && settings.weixinMirrorEnabled !== false) {
      void mirrorProactiveToWeixin({
        dataRoot: root,
        text: composed.raw,
        proactiveId,
        presetId: settings.personalityPresetId,
      })
    }

    log.info('proactive message sent', {
      kind: composed.kind,
      displayMode,
      preview: composed.raw.slice(0, 48),
    })
  } catch (e) {
    log.warn('proactive tick failed', e)
  } finally {
    ticking = false
  }
}

export function startUnifiedProactiveScheduler(getMainWindow: () => BrowserWindow | null): void {
  setProactiveMainWindowGetter(getMainWindow)
  stopUnifiedProactiveScheduler()
  scheduleNextTick()
  log.info('unified proactive scheduler started')
}

export function stopUnifiedProactiveScheduler(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function syncUnifiedProactiveScheduler(): void {
  stopUnifiedProactiveScheduler()
  scheduleNextTick()
}
