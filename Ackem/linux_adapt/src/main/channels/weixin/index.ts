import { loadSettings } from '../../settings'
import { resolveDataRoot } from '../../paths'
import { broadcastToRenderers } from '../../rendererBroadcast'
import { disconnectWeixin } from './auth'
import { startWeixinMonitor, type WeixinMonitorHandle } from './monitor'
import { loadWeixinAccount } from './store'
import { notifyWeixinStart, notifyWeixinStop } from './api'
import {
  startWeixinProactiveScheduler,
  stopWeixinProactiveScheduler
} from './proactiveScheduler'
import { ensureActivityBaselines } from './activity'
import type { WeixinAccount } from './types'
import { createLogger } from '../../logger'

const log = createLogger('weixin-channel')

let monitor: WeixinMonitorHandle | null = null
let lastError: string | null = null
let tokenExpired = false
let enabled = true

export type WeixinChannelStatus = {
  connected: boolean
  enabled: boolean
  polling: boolean
  proactiveEnabled: boolean
  accountId?: string
  userId?: string
  lastError?: string | null
  tokenExpired: boolean
}

export function getWeixinChannelStatus(dataRoot: string): WeixinChannelStatus {
  const account = loadWeixinAccount(dataRoot)
  const settings = loadSettings()
  return {
    connected: Boolean(account?.token),
    enabled,
    polling: monitor?.isRunning() ?? false,
    proactiveEnabled: settings.weixinProactiveEnabled !== false,
    accountId: account?.accountId,
    userId: account?.userId,
    lastError,
    tokenExpired
  }
}

export function setWeixinChannelEnabled(value: boolean): void {
  enabled = value
}

export function applyWeixinProactiveEnabled(dataRoot: string, on: boolean): void {
  if (!on) {
    stopWeixinProactiveScheduler()
  } else if (monitor?.isRunning()) {
    startWeixinProactiveScheduler(dataRoot, () => monitor)
  }
  broadcastStatus(dataRoot)
}

export async function startWeixinChannel(dataRoot: string): Promise<void> {
  if (!enabled) return
  const account = loadWeixinAccount(dataRoot)
  if (!account?.token) return
  await stopWeixinChannel()
  tokenExpired = false
  lastError = null
  try {
    const notify = await notifyWeixinStart(account.token, account.baseUrl)
    if (notify.ret !== 0) {
      lastError = `notifystart:${notify.ret}`
      log.warn('notifystart returned non-zero', notify)
    }
  } catch (e) {
    lastError = 'notifystart_failed'
    log.warn('notifystart failed', e)
  }
  monitor = startWeixinMonitor(account, dataRoot, {
    onTokenExpired: () => markWeixinTokenExpired(dataRoot)
  })
  ensureActivityBaselines(dataRoot)
  if (loadSettings().weixinProactiveEnabled !== false) {
    startWeixinProactiveScheduler(dataRoot, () => monitor)
  }
  broadcastStatus(dataRoot)
  log.info('weixin channel started', { accountId: account.accountId })
}

export async function stopWeixinChannel(dataRoot?: string): Promise<void> {
  stopWeixinProactiveScheduler()
  const account = dataRoot ? loadWeixinAccount(dataRoot) : null
  monitor?.stop()
  monitor = null
  if (account?.token) {
    try {
      await notifyWeixinStop(account.token, account.baseUrl)
    } catch {
      /* ignore */
    }
  }
  if (dataRoot) broadcastStatus(dataRoot)
}

export async function restartWeixinChannelIfNeeded(): Promise<void> {
  const settings = loadSettings()
  if (settings.weixinChannelEnabled === false) return
  const root = resolveDataRoot(settings)
  const account = loadWeixinAccount(root)
  if (!account) return
  await startWeixinChannel(root)
}

export function markWeixinTokenExpired(dataRoot: string): void {
  tokenExpired = true
  lastError = 'token_expired'
  void stopWeixinChannel(dataRoot)
  broadcastStatus(dataRoot)
}

function broadcastStatus(dataRoot: string): void {
  broadcastToRenderers('weixin:status-changed', getWeixinChannelStatus(dataRoot))
}

export function onWeixinAccountSaved(dataRoot: string, _account: WeixinAccount): void {
  tokenExpired = false
  lastError = null
  void startWeixinChannel(dataRoot)
}

export { disconnectWeixin, startWeixinLogin, pollWeixinLogin } from './auth'
