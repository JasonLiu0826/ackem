import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { defaultDossierPath } from '../userDossier.js'
import { kvGet, kvSet } from '../../db/repos/kv.js'

const DOSSIER_KV_NS = 'memory_dossier'
const INVALIDATED_KEY = 'invalidated_v1'

export type DossierInvalidation = {
  at: string
  reason: string
  factIds?: string[]
}

export function invalidateUserDossier(dataRoot: string, reason: string, factIds?: string[]): void {
  const payload: DossierInvalidation = {
    at: new Date().toISOString(),
    reason,
    factIds
  }
  kvSet(dataRoot, DOSSIER_KV_NS, INVALIDATED_KEY, JSON.stringify(payload))
}

export function clearUserDossierInvalidation(dataRoot: string): void {
  kvSet(dataRoot, DOSSIER_KV_NS, INVALIDATED_KEY, '')
}

export function getUserDossierInvalidation(dataRoot: string): DossierInvalidation | null {
  const raw = kvGet(dataRoot, DOSSIER_KV_NS, INVALIDATED_KEY)
  if (!raw?.trim()) return null
  try {
    return JSON.parse(raw) as DossierInvalidation
  } catch {
    return { at: raw, reason: 'legacy_invalidated' }
  }
}

export function isUserDossierPromptBlocked(dataRoot: string): boolean {
  return getUserDossierInvalidation(dataRoot) != null
}

/** @deprecated use invalidateUserDossier — kept for tests that assert file scrub side effect */
export function scrubDossierSummaries(dataRoot: string, summaries: string[]): void {
  invalidateUserDossier(dataRoot, 'governance_scrub', [])
  const path = defaultDossierPath(dataRoot)
  if (!existsSync(path) || summaries.length === 0) return
  let body = readFileSync(path, 'utf-8')
  for (const s of summaries) {
    const t = s.trim()
    if (t.length < 4) continue
    if (body.includes(t)) {
      body = body.split(t).join('').replace(/\n{3,}/g, '\n\n')
    }
  }
  writeFileSync(path, body.trim() ? `${body.trim()}\n` : '', 'utf-8')
}

export function dossierMarkdownContainsAny(dataRoot: string, needles: string[]): boolean {
  if (isUserDossierPromptBlocked(dataRoot)) return false
  const path = defaultDossierPath(dataRoot)
  if (!existsSync(path)) return false
  const body = readFileSync(path, 'utf-8')
  return needles.some((n) => n.trim().length >= 4 && body.includes(n.trim()))
}
