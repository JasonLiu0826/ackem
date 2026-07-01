import type { WebContents } from 'electron'
import type { DesktopAgentTaskDeliveryPayload } from '../../shared/desktopAgentDock'
import { createLogger } from '../logger'

const log = createLogger('desktop-agent.delivery')

/** 当前正在 chat 流式输出的 session */
const chatStreaming = new Set<string>()

export function markChatStreamStart(sessionId: string): void {
  chatStreaming.add(sessionId)
}

export function markChatStreamEnd(sessionId: string): void {
  chatStreaming.delete(sessionId)
}

export function isChatStreaming(sessionId: string): boolean {
  return chatStreaming.has(sessionId)
}

export function deliverDesktopAgentTaskResult(
  webContents: WebContents,
  payload: Omit<DesktopAgentTaskDeliveryPayload, 'queued'>
): void {
  const queued = chatStreaming.has(payload.sessionId)
  const full: DesktopAgentTaskDeliveryPayload = { ...payload, queued }
  log.info('task.delivery', {
    sessionId: payload.sessionId,
    allPassed: payload.allPassed,
    queued
  })
  if (queued) {
    webContents.send('desktop-agent:task-delivery-queued', full)
  } else {
    webContents.send('desktop-agent:task-delivery', full)
  }
}
