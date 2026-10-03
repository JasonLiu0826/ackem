import { createAckemMemorySystem } from '../memory/adapters/composeMemorySystem.js'
import type { MemoryControlCommand, MemoryControlResult } from '../memory/contracts.js'
import { loadSettings } from '../settings.js'

/** Same path as IPC `memory:control` (no Electron). */
export async function invokeMemoryControl(
  dataRoot: string,
  command: MemoryControlCommand
): Promise<MemoryControlResult> {
  const memory = createAckemMemorySystem(dataRoot)
  return memory.control(command)
}

/** Same contract as UI `memory:feedback` delete — governance delete, not FactStore.retireFact. */
export async function invokeMemoryFeedbackDelete(
  dataRoot: string,
  factId: string,
  sessionId: string
): Promise<MemoryControlResult> {
  const tz = loadSettings().timezone ?? 'Asia/Shanghai'
  return invokeMemoryControl(dataRoot, {
    kind: 'delete',
    target: { kind: 'fact', factId },
    scope: 'memory_only',
    sessionId,
    timezone: tz
  })
}
