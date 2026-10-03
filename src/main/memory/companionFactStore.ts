import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MemoryFact } from './semantic/types.js'
import type { ChatChannel } from '../session/canonical'

export type CompanionMemoryEntry = {
  factId: string
  summary: string
  sourceChannel?: ChatChannel
  occurredAt: string
  memorySide: 'user' | 'ackem'
  createdAt: string
}

function storePath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'companion-facts.json')
}

export function loadCompanionFactEntries(dataRoot: string): CompanionMemoryEntry[] {
  const p = storePath(dataRoot)
  if (!existsSync(p)) return []
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    return Array.isArray(parsed) ? (parsed as CompanionMemoryEntry[]) : []
  } catch {
    return []
  }
}

export function appendCompanionFactEntry(
  dataRoot: string,
  entry: Omit<CompanionMemoryEntry, 'createdAt'> & { createdAt?: string }
): void {
  const dir = join(dataRoot, 'memory')
  mkdirSync(dir, { recursive: true })
  const rows = loadCompanionFactEntries(dataRoot)
  rows.push({
    ...entry,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  })
  writeFileSync(storePath(dataRoot), JSON.stringify(rows.slice(-5000)), 'utf-8')
}

export function mirrorFactToCompanionStore(
  dataRoot: string,
  fact: MemoryFact,
  opts: { channel?: ChatChannel; memorySide?: 'user' | 'ackem'; occurredAt?: string }
): void {
  appendCompanionFactEntry(dataRoot, {
    factId: fact.id,
    summary: fact.summary,
    sourceChannel: opts.channel,
    occurredAt: opts.occurredAt ?? fact.createdAt,
    memorySide: opts.memorySide ?? 'user',
  })
}
