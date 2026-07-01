interface SessionExtensionState {
  rejected: boolean
  lastTriggeredAt?: number
}

const bySession = new Map<string, Map<string, SessionExtensionState>>()

function sessionMap(sessionId: string): Map<string, SessionExtensionState> {
  let m = bySession.get(sessionId)
  if (!m) {
    m = new Map()
    bySession.set(sessionId, m)
  }
  return m
}

export function recordDispatchTrigger(sessionId: string, extensionId: string): void {
  const m = sessionMap(sessionId)
  const prev = m.get(extensionId) ?? { rejected: false }
  m.set(extensionId, { ...prev, lastTriggeredAt: Date.now() })
}

export function recordDispatchReject(sessionId: string, extensionId: string): void {
  const m = sessionMap(sessionId)
  const prev = m.get(extensionId) ?? { rejected: false }
  m.set(extensionId, { rejected: true, lastTriggeredAt: prev.lastTriggeredAt })
}

export function isRejectedInSession(sessionId: string, extensionId: string): boolean {
  return bySession.get(sessionId)?.get(extensionId)?.rejected ?? false
}

export function getLastTriggeredAt(sessionId: string, extensionId: string): number | undefined {
  return bySession.get(sessionId)?.get(extensionId)?.lastTriggeredAt
}

export function clearDispatchSession(sessionId: string): void {
  bySession.delete(sessionId)
}

/** @internal 测试用 */
export function resetAllDispatchSessions(): void {
  bySession.clear()
}
