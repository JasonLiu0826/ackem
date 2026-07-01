import { fetchUpdates, isStaleWeixinToken } from './api'
import { enqueueInboundWeixinMessage } from './bridge'
import { loadSyncBuf, saveSyncBuf } from './store'
import type { WeixinAccount } from './types'
import { createLogger } from '../../logger'

const log = createLogger('weixin-monitor')

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export type WeixinMonitorHandle = {
  stop: () => void
  isRunning: () => boolean
}

export function startWeixinMonitor(
  account: WeixinAccount,
  dataRoot: string,
  hooks?: { onTokenExpired?: () => void }
): WeixinMonitorHandle {
  let aborted = false
  let running = false
  let consecutiveFailures = 0
  const abortController = new AbortController()

  const loop = async () => {
    running = true
    let buf = loadSyncBuf(dataRoot, account.accountId)
    let nextTimeout = 35_000

    log.info('poll loop started', { accountId: account.accountId })

    while (!aborted) {
      try {
        const resp = await fetchUpdates({
          token: account.token,
          baseUrl: account.baseUrl,
          getUpdatesBuf: buf,
          timeoutMs: nextTimeout,
          abortSignal: abortController.signal
        })

        if (isStaleWeixinToken(resp)) {
          log.warn('token expired (ret=-14)')
          hooks?.onTokenExpired?.()
          break
        }

        if (resp.ret != null && resp.ret !== 0) {
          log.warn('getupdates api error', { ret: resp.ret, errmsg: resp.errmsg })
          consecutiveFailures++
          await sleep(consecutiveFailures >= 3 ? 30_000 : 2_000)
          continue
        }

        nextTimeout = resp.longpolling_timeout_ms ?? 35_000

        if (resp.get_updates_buf) {
          saveSyncBuf(dataRoot, account.accountId, resp.get_updates_buf)
          buf = resp.get_updates_buf
        }

        const msgs = resp.msgs ?? []
        if (msgs.length > 0) {
          log.info('inbound messages', { count: msgs.length })
        }

        for (const msg of msgs) {
          if (msg.message_type === 1) {
            enqueueInboundWeixinMessage(msg, account, dataRoot)
          }
        }

        consecutiveFailures = 0
      } catch (e) {
        if (aborted) break
        consecutiveFailures++
        log.error('poll error', e)
        if (consecutiveFailures >= 3) {
          await sleep(30_000)
          consecutiveFailures = 0
        } else {
          await sleep(2_000)
        }
      }
    }
    running = false
    log.info('poll loop stopped', { accountId: account.accountId })
  }

  void loop()

  return {
    stop: () => {
      aborted = true
      abortController.abort()
    },
    isRunning: () => running && !aborted
  }
}
