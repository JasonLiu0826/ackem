import { createLogger } from '../../logger'
import type { EngineSnapshot } from '../protocols'
import type { DispatchCatalogEntry } from '../protocols'
import type { ExtensionsCoordinator } from '../coordinator'
import { recordDispatchTrigger } from './dispatchSession'
import { recordProactiveMessage } from '../policy/attentionBudget'

const log = createLogger('dispatch-scheduler')

export async function tickAutonomousPluginEntry(
  coordinator: ExtensionsCoordinator,
  sessionId: string,
  entry: DispatchCatalogEntry,
  snapshot: EngineSnapshot,
  dataRoot: string,
  now: number,
  policyReason: string
): Promise<boolean> {
  if (entry.category !== 'plugin') return false

  try {
    const result = await coordinator.plugins.invokeOnEngineUpdate(entry.id, snapshot)
    if (!result?.ok) return false

    recordDispatchTrigger(sessionId, entry.id)
    recordProactiveMessage(dataRoot, now)
    log.info('autonomous plugin tick', {
      extensionId: entry.id,
      policyReason
    })
    return true
  } catch (err) {
    log.warn('autonomous plugin tick failed', { extensionId: entry.id, err })
    return false
  }
}
