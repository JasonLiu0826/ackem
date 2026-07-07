import { randomUUID } from 'node:crypto'
import type {
  OpenForUPermissionId,
  PermissionRequestPayload
} from '../../../shared/openforuPermissions'

export type PermissionDecision = 'approved' | 'denied' | 'timeout'

type PendingRequest = {
  resolve: (decision: PermissionDecision) => void
  timer: ReturnType<typeof setTimeout>
}

const pending = new Map<string, PendingRequest>()

let broadcastFn: ((channel: 'openforu:permissions:request', payload: PermissionRequestPayload) => void) | null =
  null

export function configurePermissionGate(
  broadcast: (channel: 'openforu:permissions:request', payload: PermissionRequestPayload) => void
): void {
  broadcastFn = broadcast
}

export function resetPermissionGateForTests(): void {
  for (const [, req] of pending) {
    clearTimeout(req.timer)
    req.resolve('denied')
  }
  pending.clear()
  broadcastFn = null
}

export function resolvePermissionRequest(requestId: string, decision: PermissionDecision): boolean {
  const req = pending.get(requestId)
  if (!req) return false
  clearTimeout(req.timer)
  pending.delete(requestId)
  req.resolve(decision)
  return true
}

export function shouldAutoApprovePermissions(): boolean {
  return process.env.Ackem_AUTO_APPROVE_PERMISSIONS === '1'
}

export async function requestUserPermissionApproval(
  input: Omit<PermissionRequestPayload, 'requestId'>,
  opts?: { timeoutMs?: number; skip?: boolean }
): Promise<PermissionDecision> {
  if (opts?.skip || shouldAutoApprovePermissions()) {
    return 'approved'
  }
  if (!broadcastFn) {
    return 'denied'
  }

  const requestId = randomUUID()
  const payload: PermissionRequestPayload = { ...input, requestId }

  return new Promise<PermissionDecision>((resolve) => {
    const timeoutMs = opts?.timeoutMs ?? 120_000
    const timer = setTimeout(() => {
      pending.delete(requestId)
      resolve('timeout')
    }, timeoutMs)

    pending.set(requestId, { resolve, timer })
    broadcastFn!('openforu:permissions:request', payload)
  })
}

export function approvedPermissionsFromDecision(
  decision: PermissionDecision,
  pending: OpenForUPermissionId[]
): OpenForUPermissionId[] {
  return decision === 'approved' ? pending : []
}
