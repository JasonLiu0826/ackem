/** Agents currently in active chat — tick must skip emotion writes for them. */

const inFlight = new Set<string>()

export function markChatInFlight(agentId: string): void {
  inFlight.add(agentId)
}

export function clearChatInFlight(agentId: string): void {
  inFlight.delete(agentId)
}

export function isChatInFlight(agentId: string): boolean {
  return inFlight.has(agentId)
}

export function listChatInFlight(): string[] {
  return [...inFlight]
}
