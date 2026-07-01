import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DesktopAgentAuditEntry } from '../../shared/desktopAgent'

export function auditLogPath(dataRoot: string): string {
  return join(dataRoot, 'desktop-agent', 'audit.jsonl')
}

export function appendDesktopAgentAudit(dataRoot: string, entry: DesktopAgentAuditEntry): void {
  const path = auditLogPath(dataRoot)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(entry)}\n`, 'utf-8')
}

/** 读取某时间点之后的审计条目（用于单轮 TaskPlan 验收） */
export function readAuditEntriesSince(
  dataRoot: string,
  sinceIso: string
): DesktopAgentAuditEntry[] {
  const path = auditLogPath(dataRoot)
  if (!existsSync(path)) return []
  const since = Date.parse(sinceIso)
  if (Number.isNaN(since)) return []

  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean)
  const out: DesktopAgentAuditEntry[] = []
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as DesktopAgentAuditEntry
      const ts = Date.parse(entry.ts)
      if (!Number.isNaN(ts) && ts >= since) out.push(entry)
    } catch {
      /* skip */
    }
  }
  return out
}
