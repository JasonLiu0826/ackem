import { randomUUID } from 'node:crypto'
import type {
  DesktopAgentConfirmDecision,
  DesktopAgentConfirmRequest
} from '../../../shared/desktopAgent'

type PendingConfirm = {
  resolve: (decision: DesktopAgentConfirmDecision) => void
  timer: ReturnType<typeof setTimeout>
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
  decision: DesktopAgentConfirmDecision
): boolean {
  const req = pending.get(requestId)
  if (!req) return false
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
  opts?: { timeoutMs?: number; skip?: boolean }
): Promise<DesktopAgentConfirmDecision> {
  if (opts?.skip || process.env.Ackem_AUTO_APPROVE_DESKTOP_AGENT === '1') {
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

    pending.set(requestId, { resolve, timer })
    broadcastFn!('desktop-agent:confirm:request', payload)
  })
}
