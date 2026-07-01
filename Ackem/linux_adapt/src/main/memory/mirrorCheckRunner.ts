// [mirrorCheckRunner] — 镜中记忆检测 + 发现持久化（FIX-015）
// 职责：self.md 与 SELF_PERCEPTION/OUR_BOND 事实对比；写入 findings 供 UI/日志读取

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { detectContradictions, readSelfMd, type Contradiction } from '../engine/mirror'
import type { FactStore } from './factStore'

export type MirrorFindingRecord = Contradiction & {
  detectedAt: string
  turn: number
}

export type FactContradictionRecord = {
  newFactId: string
  existingFactId: string
  reason: string
  action: string
  detectedAt: string
  turn: number
}

export type MirrorFindingsFile = {
  version: 1
  mirror: MirrorFindingRecord[]
  factFlags: FactContradictionRecord[]
}

const MAX_FINDINGS = 30

export function mirrorFindingsPath(dataRoot: string): string {
  return join(dataRoot, 'memory', 'mirror-findings.json')
}

export function readMirrorFindings(dataRoot: string): MirrorFindingsFile {
  const path = mirrorFindingsPath(dataRoot)
  if (!existsSync(path)) {
    return { version: 1, mirror: [], factFlags: [] }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as MirrorFindingsFile
    return {
      version: 1,
      mirror: Array.isArray(raw.mirror) ? raw.mirror : [],
      factFlags: Array.isArray(raw.factFlags) ? raw.factFlags : [],
    }
  } catch {
    return { version: 1, mirror: [], factFlags: [] }
  }
}

function writeMirrorFindings(dataRoot: string, file: MirrorFindingsFile): void {
  const path = mirrorFindingsPath(dataRoot)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(file, null, 2), 'utf-8')
}

export function appendMirrorFindings(
  dataRoot: string,
  mirror: Contradiction[],
  factFlags: Omit<FactContradictionRecord, 'detectedAt' | 'turn'>[],
  turn: number
): MirrorFindingsFile {
  const now = new Date().toISOString()
  const prev = readMirrorFindings(dataRoot)
  const nextMirror: MirrorFindingRecord[] = [
    ...mirror.map((c) => ({ ...c, detectedAt: now, turn })),
    ...prev.mirror,
  ].slice(0, MAX_FINDINGS)
  const nextFlags: FactContradictionRecord[] = [
    ...factFlags.map((f) => ({ ...f, detectedAt: now, turn })),
    ...prev.factFlags,
  ].slice(0, MAX_FINDINGS)
  const file: MirrorFindingsFile = { version: 1, mirror: nextMirror, factFlags: nextFlags }
  writeMirrorFindings(dataRoot, file)
  return file
}

export function buildSelfPerceptionCorpus(factStore: FactStore): string {
  factStore.load()
  return factStore
    .listActive()
    .filter((f) => f.subcategory === 'SELF_PERCEPTION' || f.subcategory === 'OUR_BOND')
    .map((f) => f.summary)
    .join('。')
}

/** 对比 self.md 与自我认知类事实，返回镜中矛盾 */
export async function runMirrorCheck(dataRoot: string, factStore: FactStore): Promise<Contradiction[]> {
  const current = readSelfMd(dataRoot)
  if (!current.trim()) return []
  const selfFacts = buildSelfPerceptionCorpus(factStore)
  if (!selfFacts) return []
  return detectContradictions(selfFacts, current)
}

export function hasMirrorCheckInputs(dataRoot: string, factStore: FactStore): boolean {
  const selfMd = readSelfMd(dataRoot).trim()
  const selfFacts = buildSelfPerceptionCorpus(factStore)
  return selfMd.length > 0 && selfFacts.length > 0
}
