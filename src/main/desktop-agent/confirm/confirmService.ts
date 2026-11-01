import { randomUUID } from 'node:crypto'
import type {
  DesktopAgentConfirmDecision,
  DesktopAgentConfirmRequest
} from '../../../shared/desktopAgent'

type PendingConfirm = {
  resolve: (decision: DesktopAgentConfirmDecision) => void
  timer: ReturnType<typeof setTimeout>
  /** 主窗口 webContents id（由 request 时注入）；null 表示不校验来源 */
  mainWindowId: number | null
}

const pending = new Map<string, PendingConfirm>()

let broadcastFn:
  | ((channel: 'desktop-agent:confirm:request', payload: DesktopAgentConfirmRequest) => void)
  | null = null

export function configureDesktopAgentConfirmGate(
  broadcast: (channel: 'desktop-agent:confirm:request', payload: DesktopAgentConfirmRequest) => void
): void {
  broadcastFn = broadcast
}

export function resetDesktopAgentConfirmGateForTests(): void {
  cancelAllDesktopAgentConfirms('denied')
  broadcastFn = null
}

export function resolveDesktopAgentConfirm(
  requestId: string,
  decision: DesktopAgentConfirmDecision,
  opts?: { senderId?: number }
): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  // 只允许主窗口的确认弹窗响应：防止其它窗口/被注入渲染进程代点"允许"
  if (opts?.senderId !== undefined && req.mainWindowId !== null && opts.senderId !== req.mainWindowId) {
    return false
  }
  clearTimeout(req.timer)
  pending.delete(requestId)
  req.resolve(decision)
  return true
}

export function cancelAllDesktopAgentConfirms(reason: DesktopAgentConfirmDecision = 'denied'): void {
  for (const [, req] of pending) {
    clearTimeout(req.timer)
    req.resolve(reason)
  }
  pending.clear()
}

export async function requestDesktopAgentConfirm(
  input: Omit<DesktopAgentConfirmRequest, 'requestId'>,
  opts?: { timeoutMs?: number; skip?: boolean; mainWindowId?: number | null }
): Promise<DesktopAgentConfirmDecision> {
  // 全局自动批准旁路仅限开发构建，生产构建一律走确认门
  const devAutoApprove =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: unknown } }).env?.DEV === true &&
    process.env.ACKEM_AUTO_APPROVE_DESKTOP_AGENT === '1'
  if (opts?.skip || devAutoApprove) {
    return 'allowed'
  }
  if (input.hardBlockReason) {
    return 'denied'
  }
  if (!broadcastFn) {
    return 'denied'
  }

  const requestId = randomUUID()
  const payload: DesktopAgentConfirmRequest = { ...input, requestId }

  return new Promise<DesktopAgentConfirmDecision>((resolve) => {
    const timeoutMs = opts?.timeoutMs ?? 120_000
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve('timeout')
    }, timeoutMs)

    pending.set(requestId, { resolve, timer, mainWindowId: opts?.mainWindowId ?? null })
    broadcastFn!('desktop-agent:confirm:request', payload)
  })
}
