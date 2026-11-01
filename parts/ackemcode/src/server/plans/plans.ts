import fs from 'node:fs/promises'
import path from 'node:path'
import type { AckemCodeSettings } from '../../shared/types.js'
import { DATA_DIR } from '../settingsStore.js'

const slugCache = new Map<string, string>()

const ADJECTIVES = [
  'calm',
  'bright',
  'swift',
  'quiet',
  'bold',
  'clear',
  'steady',
  'keen',
  'warm',
  'cool'
] as const

const NOUNS = [
  'river',
  'maple',
  'orbit',
  'spark',
  'anchor',
  'compass',
  'ledger',
  'beacon',
  'harbor',
  'signal'
] as const

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

/** CC generateWordSlug spirit — human-readable plan filenames. */
export function generatePlanSlug(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`
}

export function getPlanSlug(sessionId: string): string {
  let slug = slugCache.get(sessionId)
  if (!slug) {
    slug = generatePlanSlug()
    slugCache.set(sessionId, slug)
  }
  return slug
}

export function setPlanSlug(sessionId: string, slug: string): void {
  slugCache.set(sessionId, slug)
}

export function clearPlanSlug(sessionId?: string): void {
  if (sessionId) slugCache.delete(sessionId)
  else slugCache.clear()
}

/**
 * Resolve plans directory (CC getPlansDirectory).
 * Default ~/.ackemcode/plans via DATA_DIR parent; optional project-relative override.
 */
export function getPlansDirectory(
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): string {
  const custom = settings.plansDirectory?.trim()
  if (custom) {
    const resolved = path.resolve(cwd, custom)
    const cwdNorm = path.resolve(cwd)
    if (
      resolved === cwdNorm ||
      resolved.startsWith(cwdNorm + path.sep)
    ) {
      return resolved
    }
  }
  return path.join(path.dirname(DATA_DIR), 'plans')
}

export async function ensurePlansDirectory(
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): Promise<string> {
  const dir = getPlansDirectory(settings, cwd)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export function getPlanFilePath(
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): string {
  const slug = getPlanSlug(sessionId)
  return path.join(getPlansDirectory(settings, cwd), `${slug}.md`)
}

export async function planExists(
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): Promise<boolean> {
  try {
    await fs.access(getPlanFilePath(sessionId, settings, cwd))
    return true
  } catch {
    return false
  }
}

export async function readPlan(
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): Promise<string> {
  try {
    return await fs.readFile(getPlanFilePath(sessionId, settings, cwd), 'utf8')
  } catch {
    return ''
  }
}

export async function writePlan(
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string,
  content: string
): Promise<string> {
  await ensurePlansDirectory(settings, cwd)
  const fp = getPlanFilePath(sessionId, settings, cwd)
  await fs.writeFile(fp, content, 'utf8')
  return fp
}

/** Ensure slug + directory exist; returns absolute plan file path. */
export async function ensurePlanFile(
  sessionId: string,
  settings: Pick<AckemCodeSettings, 'plansDirectory'>,
  cwd: string
): Promise<string> {
  await ensurePlansDirectory(settings, cwd)
  getPlanSlug(sessionId)
  return getPlanFilePath(sessionId, settings, cwd)
}

export function isSamePlanFile(
  candidatePath: string,
  planFilePath: string,
  cwd: string
): boolean {
  if (!candidatePath.trim() || !planFilePath.trim()) return false
  try {
    const a = path.resolve(cwd, candidatePath)
    const b = path.resolve(planFilePath)
    return a === b
  } catch {
    return false
  }
}
