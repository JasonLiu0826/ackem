import type { AgentEvent, AgentRunMeta } from './types'

export type AgentEventListener = (event: AgentEvent) => void

export class AgentEventBus {
  private listeners = new Set<AgentEventListener>()

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  emitFromRun(
    run: AgentRunMeta,
    kind: AgentEvent['kind'],
    message: string,
    payload?: AgentEvent['payload']
  ): void {
    this.emit({
      runId: run.runId,
      sessionId: run.sessionId,
      ts: new Date().toISOString(),
      phase: run.phase,
      kind,
      message,
      payload
    })
  }

  clear(): void {
    this.listeners.clear()
  }
}
