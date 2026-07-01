import type { AgentEvent } from '../../../../shared/openforuAgentTypes'
import { getOpenForUAgentRunner, type AgentRunnerDeps } from './runner'

let bridged = false

/** 将 Runner 事件广播到渲染进程（registerOpenForUIpc 时调用一次） */
export function wireOpenForUAgentEventBroadcast(
  broadcast: (channel: 'openforu:agent:event', payload: AgentEvent) => void,
  deps: AgentRunnerDeps
): void {
  if (bridged) return
  bridged = true
  const runner = getOpenForUAgentRunner(deps)
  runner.subscribe((event) => broadcast('openforu:agent:event', event))
}

export function resetAgentEventBridgeForTests(): void {
  bridged = false
}
