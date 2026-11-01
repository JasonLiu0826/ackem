// [qq] — 事件监听：把 OneBot 的 WS 事件流接到 QQ 渠道业务层

import { OneBotClient } from './onebot'
import { enqueueInboundQqMessage } from './bridge'
import type { OneBotEvent, OneBotMessageEvent, QqAccount } from './types'
import { createLogger } from '../../logger'

const log = createLogger('qq-monitor')

export type QqMonitorHandle = {
  stop: () => void
  isRunning: () => boolean
  client: OneBotClient
}

export type QqMonitorHooks = {
  onConnected?: () => void
  onDisconnected?: (reason: string) => void
}

export function startQqMonitor(
  account: QqAccount,
  dataRoot: string,
  hooks?: QqMonitorHooks
): QqMonitorHandle {
  let running = true

  const client = new OneBotClient({
    httpBaseUrl: account.httpBaseUrl,
    wsUrl: account.wsUrl,
    accessToken: account.accessToken,
    onConnected: () => {
      log.info('qq channel connected', { selfId: account.selfId })
      hooks?.onConnected?.()
    },
    onDisconnected: (reason) => {
      log.warn('qq channel disconnected', { reason })
      hooks?.onDisconnected?.(reason)
    },
    onEvent: (event: OneBotEvent) => {
      if (!running) return
      dispatch(event)
    }
  })

  function dispatch(event: OneBotEvent): void {
    switch (event.post_type) {
      case 'message': {
        enqueueInboundQqMessage({
          event: event as OneBotMessageEvent,
          account,
          client,
          dataRoot
        })
        break
      }
      case 'request': {
        // 好友申请处理留给后续阶段：先只记录，便于调试与审计
        log.info('qq request event', {
          requestType: event.request_type,
          userId: event.user_id,
          flag: event.flag
        })
        break
      }
      case 'notice': {
        // 戳一戳等通知：暂不响应，避免刷屏
        break
      }
      case 'meta_event': {
        // 心跳/生命周期由 OneBotClient 内部判定，不向上传播
        break
      }
      default:
        break
    }
  }

  client.start()

  return {
    stop: () => {
      running = false
      client.stop()
    },
    isRunning: () => running && client.isConnected(),
    client
  }
}
