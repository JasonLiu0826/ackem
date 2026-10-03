import { getDatabase } from '../../db/database.js'
import { ActionRepository } from './actionRepository.js'

function queuedInput(raw: string | null | undefined): { prompt?: string; cwd?: string } {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return {}
    const input = value as Record<string, unknown>
    return {
      prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
      cwd: typeof input.cwd === 'string' ? input.cwd : undefined
    }
  } catch {
    return {}
  }
}

/** Read-only control view. The slot cache is not authoritative after restart. */
export function readActionControlView(dataRoot: string, sessionId: string) {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const repo = new ActionRepository(db)
  const queued = repo.listQueued(sessionId)
    .filter((row) => row.nature === 'work')
    .map((row) => {
      const execution = queuedInput(row.execution_json)
      return {
        id: row.run_id,
        planId: row.plan_id ?? undefined,
        version: row.version,
        summary: execution.prompt ?? '',
        cwd: execution.cwd,
      }
    })
  return { queued, live: repo.latestInFlightWork(sessionId) }
}
