import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { saveAgentRunToDb } from '../../../db/repos/openforu'
import type { AgentRunMeta } from './types'

/** AC-4：Agent run 元数据落盘（V-16） */
export function persistAgentRun(dataRoot: string, run: AgentRunMeta): void {
  const dir = join(dataRoot, 'openforu', 'runs')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(join(dir, `${run.runId}.json`), `${JSON.stringify(run, null, 2)}\n`, 'utf-8')
  saveAgentRunToDb(dataRoot, run)
}

export function agentRunFilePath(dataRoot: string, runId: string): string {
  return join(dataRoot, 'openforu', 'runs', `${runId}.json`)
}

export function loadAgentRunFromDisk(dataRoot: string, runId: string): AgentRunMeta | null {
  const path = agentRunFilePath(dataRoot, runId)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as AgentRunMeta
  } catch {
    return null
  }
}

export function listPersistedAgentRuns(dataRoot: string): AgentRunMeta[] {
  const dir = join(dataRoot, 'openforu', 'runs')
  if (!existsSync(dir)) return []
  const out: AgentRunMeta[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue
    const run = loadAgentRunFromDisk(dataRoot, name.replace(/\.json$/, ''))
    if (run) out.push(run)
  }
  return out
}

/** 未完成的 deploy_pipeline（应用重启后可恢复） */
export function listIncompleteAgentRuns(dataRoot: string): AgentRunMeta[] {
  const bySession = new Map<string, AgentRunMeta>()
  for (const run of listPersistedAgentRuns(dataRoot)) {
    if (run.status !== 'running' || run.kind !== 'deploy_pipeline') continue
    const prev = bySession.get(run.sessionId)
    if (!prev || run.updatedAt > prev.updatedAt) {
      bySession.set(run.sessionId, run)
    }
  }
  return [...bySession.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
}
