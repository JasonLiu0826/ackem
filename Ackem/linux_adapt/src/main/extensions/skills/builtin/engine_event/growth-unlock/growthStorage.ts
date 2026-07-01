import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TRUST_MILESTONES } from './manifest'

type UnlockState = { unlocked: number[] }

function unlockFile(dataRoot: string): string {
  const dir = join(dataRoot, 'growth')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'unlocks.json')
}

function loadState(dataRoot: string): UnlockState {
  const file = unlockFile(dataRoot)
  if (!existsSync(file)) return { unlocked: [] }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as UnlockState
    return { unlocked: Array.isArray(raw.unlocked) ? raw.unlocked : [] }
  } catch {
    return { unlocked: [] }
  }
}

function saveState(dataRoot: string, state: UnlockState): void {
  writeFileSync(unlockFile(dataRoot), JSON.stringify(state, null, 2), 'utf-8')
}

export function findNewTrustMilestone(
  prevTrust: number,
  nextTrust: number,
  dataRoot: string
): number | null {
  const state = loadState(dataRoot)
  for (const m of TRUST_MILESTONES) {
    if (prevTrust < m && nextTrust >= m && !state.unlocked.includes(m)) {
      return m
    }
  }
  return null
}

export function recordTrustMilestone(dataRoot: string, milestone: number): void {
  const state = loadState(dataRoot)
  if (!state.unlocked.includes(milestone)) {
    state.unlocked.push(milestone)
    state.unlocked.sort((a, b) => a - b)
    saveState(dataRoot, state)
  }
}

export function milestoneMessage(milestone: number): string {
  if (milestone >= 70) return '【成长解锁】信任已经很深了——解锁「默契纪念」彩蛋文案。'
  if (milestone >= 50) return '【成长解锁】关系更近了——解锁「熟悉纪念」彩蛋文案。'
  return '【成长解锁】开始熟悉彼此了——解锁「初识纪念」彩蛋文案。'
}
