import { FactStore, defaultFactsPath } from '../memory/factStore.js'
import type { MemoryControlCommand, MemoryTarget } from '../memory/contracts.js'
import { resolveMemoryControlIntent } from '../memory/governance/controlIntent.js'
import { loadSettings } from '../settings.js'
import { invokeMemoryControl, invokeMemoryFeedbackDelete } from './memoryControlBridge.js'

export type MemoryIpcRuntime = {
  dataRoot: () => string
  sessionId: () => string
}

/**
 * Pure handlers registered on ipcMain — tests call these directly (no Electron).
 *
 * Entry routing:
 * - `memory:control` → governance four-type contract (`executeMemoryControl` via adapter)
 * - `memory:feedback` delete → governance `delete` / `memory_only` (tombstone), not `retireFact`
 * - `memory:retire` → legacy FactStore.retireFact only (no tombstone / source purge)
 * - `memory:resolveControl` → ambiguous natural-language control → requiresConfirmation
 */
export function createMemoryIpcHandlers(runtime: MemoryIpcRuntime) {
  return {
    memoryControl(command: MemoryControlCommand) {
      return invokeMemoryControl(runtime.dataRoot(), command)
    },

    async memoryFeedbackDelete(factId: string) {
      return invokeMemoryFeedbackDelete(runtime.dataRoot(), factId, runtime.sessionId())
    },

    memoryRetire(factId: string): boolean {
      const root = runtime.dataRoot()
      const store = new FactStore(defaultFactsPath(root))
      store.load()
      return store.retireFact(factId)
    },

    memoryResolveControl(text: string, candidateTargets: MemoryTarget[]) {
      const tz = loadSettings().timezone ?? 'Asia/Shanghai'
      return resolveMemoryControlIntent(text, { sessionId: runtime.sessionId(), timezone: tz }, candidateTargets)
    }
  }
}

export type MemoryIpcHandlers = ReturnType<typeof createMemoryIpcHandlers>
