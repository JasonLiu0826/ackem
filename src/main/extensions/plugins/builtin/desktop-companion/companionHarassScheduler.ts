import type { BrowserWindow } from 'electron'
import { Notification } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createLogger } from '../../../../logger'
import { loadSettings } from '../../../../settings'
import { resolveDataRoot } from '../../../../paths'
import { composeCompanionProactiveMessage } from '../../../../companion/proactiveCompose'
import { loadState, saveState } from '../../../../engine/state-persistence'
import {
  getTimeContext,
  type TimeContext
} from './desktop-companion'
import {
  sanitizeDesktopProactiveMessage,
  templateDesktopProactiveMessage
} from './proactiveNotificationMessage'
import { notificationBodyFromProactiveMessage } from './companionHarass'
import {
  pickPersonalityHarassDelayMs,
  shouldHarassTickForPersonality
} from '../../../../companion/proactivePersonalityContext'

const log = createLogger('companion-harass-scheduler')

let harassTimer: ReturnType<typeof setTimeout> | null = null
let harassTicking = false
let mainWindowGetter: (() => BrowserWindow | null) | null = null

export function setCompanionHarassMainWindowGetter(fn: () => BrowserWindow | null): void {
  mainWindowGetter = fn
}

export function deliverCompanionProactiveMessage(args: {
  mainWindow: BrowserWindow | null
  message: string
  timeContext?: TimeContext
  source?: 'idle' | 'harass'
}): void {
  const { mainWindow } = args
  const timeContext = args.timeContext ?? getTimeContext()
  const message =
    sanitizeDesktopProactiveMessage(args.message, 120) ??
    templateDesktopProactiveMessage(timeContext)

  if (Notification.isSupported()) {
    const n = new Notification({
      title: 'Ackem',
      body: notificationBodyFromProactiveMessage(message),
      silent: true
    })
    n.show()
  }

  try {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    const sid = s.activeSessionId || 'default'
    const file = join(root, 'companion', `chat-history-${sid}.json`)
    let rows: Array<{ role: string; content: string }> = []
    if (existsSync(file)) {
      try {
        rows = JSON.parse(readFileSync(file, 'utf-8'))
      } catch {
        /* reset */
      }
    }
    rows.push({ role: 'assistant', content: message })
    mkdirSync(join(root, 'companion'), { recursive: true })
    writeFileSync(file, JSON.stringify(rows.slice(-2000)), 'utf-8')
  } catch {
    /* non-critical */
  }

  mainWindow?.webContents.send('companion:proactive', {
    message,
    timeContext,
    ...(args.source ? { source: args.source } : {})
  })
}

async function tickCompanionHarass(): Promise<void> {
  if (harassTicking) return
  harassTicking = true
  try {
    const settings = loadSettings()
    if (!settings.companionHarassEnabled) return

    if (!shouldHarassTickForPersonality(settings.personalityPresetId)) {
      log.debug('harass tick skipped for low-initiative personality', {
        presetId: settings.personalityPresetId
      })
      return
    }

    const mainWindow = mainWindowGetter?.() ?? null
    if (!mainWindow) return

    const root = resolveDataRoot(settings)
    const sessionId = settings.activeSessionId || 'default'
    const composed = await composeCompanionProactiveMessage({
      dataRoot: root,
      settings,
      sessionId,
      harass: true
    })
    if (!composed) return

    const state = loadState(root, sessionId)
    if (state) {
      state.counters.totalTurns = (state.counters?.totalTurns ?? 0) + 1
      saveState(root, state, sessionId)
    }

    deliverCompanionProactiveMessage({
      mainWindow,
      message: composed.raw,
      timeContext: getTimeContext(),
      source: 'harass'
    })

    log.info('harass message sent', {
      kind: composed.kind,
      preview: composed.raw.slice(0, 48)
    })
  } catch (e) {
    log.warn('harass tick failed', e)
  } finally {
    harassTicking = false
  }
}

function scheduleNextHarassTick(): void {
  if (harassTimer) {
    clearTimeout(harassTimer)
    harassTimer = null
  }

  const settings = loadSettings()
  if (!settings.companionHarassEnabled) return

  const delayMs = pickPersonalityHarassDelayMs(settings.personalityPresetId)
  harassTimer = setTimeout(() => {
    void tickCompanionHarass().finally(() => {
      scheduleNextHarassTick()
    })
  }, delayMs)

  log.debug('harass next tick scheduled', { delayMs })
}

export function syncCompanionHarassScheduler(): void {
  if (harassTimer) {
    clearTimeout(harassTimer)
    harassTimer = null
  }
  if (!loadSettings().companionHarassEnabled) return
  scheduleNextHarassTick()
  log.info('harass scheduler synced')
}

export function stopCompanionHarassScheduler(): void {
  if (harassTimer) {
    clearTimeout(harassTimer)
    harassTimer = null
  }
}

export function startCompanionHarassScheduler(): void {
  syncCompanionHarassScheduler()
}
