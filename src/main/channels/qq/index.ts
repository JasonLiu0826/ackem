// [qq] — QQ 渠道生命周期（启停 / 状态 / 广播）

import { loadSettings } from '../../settings'
import { resolveDataRoot } from '../../paths'
import { broadcastToRenderers } from '../../rendererBroadcast'
import { startQqMonitor, type QqMonitorHandle } from './monitor'
import { loadQqAccount } from './store'
import { memeLibraryStats, memesRoot } from './memes'
import type { QqAccount } from './types'
import { createLogger } from '../../logger'
import type { OneBotClient } from './onebot'

const log = createLogger('qq-channel')

let monitor: QqMonitorHandle | null = null
let lastError: string | null = null
let enabled = true

export type QqChannelStatus = {
  connected: boolean
  enabled: boolean
  listening: boolean
  selfId?: string
  nickname?: string
  httpBaseUrl?: string
  wsUrl?: string
  lastError?: string | null
  /** 表情包目录与库存，供设置页显示 */
  memesPath?: string
  memeCount?: number
}

/** 当前在跑的 OneBot 客户端（QQ 空间等衍生功能复用同一条连接） */
export function getQqClient(): OneBotClient | null {
  return monitor?.client ?? null
}

export function getQqChannelStatus(dataRoot: string): QqChannelStatus {
  const account = loadQqAccount(dataRoot)
  const stats = memeLibraryStats(dataRoot)
  return {
    connected: Boolean(account?.httpBaseUrl),
    enabled,
    listening: monitor?.isRunning() ?? false,
    selfId: account?.selfId || undefined,
    nickname: account?.nickname,
    httpBaseUrl: account?.httpBaseUrl,
    wsUrl: account?.wsUrl,
    lastError,
    memesPath: memesRoot(dataRoot),
    memeCount: stats.total
  }
}

export function setQqChannelEnabled(value: boolean): void {
  enabled = value
}

export async function startQqChannel(dataRoot: string): Promise<void> {
  if (!enabled) return
  const account = loadQqAccount(dataRoot)
  if (!account?.httpBaseUrl || !account?.wsUrl) return

  await stopQqChannel()
  lastError = null

  monitor = startQqMonitor(account, dataRoot, {
    onConnected: () => {
      lastError = null
      broadcastStatus(dataRoot)
    },
    onDisconnected: (reason) => {
      lastError = `disconnected:${reason}`
      broadcastStatus(dataRoot)
    }
  })

  broadcastStatus(dataRoot)
  log.info('qq channel started', { selfId: account.selfId })
}

export async function stopQqChannel(dataRoot?: string): Promise<void> {
  monitor?.stop()
  monitor = null
  if (dataRoot) broadcastStatus(dataRoot)
}

export async function restartQqChannelIfNeeded(): Promise<void> {
  const settings = loadSettings()
  if (settings.qqChannelEnabled === false) return
  const root = resolveDataRoot(settings)
  const account = loadQqAccount(root)
  if (!account) return
  await startQqChannel(root)
}

export function markQqDisconnected(dataRoot: string, reason: string): void {
  lastError = reason
  broadcastStatus(dataRoot)
}

export function onQqAccountSaved(dataRoot: string, _account: QqAccount): void {
  lastError = null
  void startQqChannel(dataRoot)
}

function broadcastStatus(dataRoot: string): void {
  broadcastToRenderers('qq:status-changed', getQqChannelStatus(dataRoot))
}
