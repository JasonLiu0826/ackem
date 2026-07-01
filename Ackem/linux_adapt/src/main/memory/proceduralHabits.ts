import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendHabitToDb, loadHabitsFromDb, replaceHabitsInDb } from '../db/repos/proceduralHabits'
import { getDatabase } from '../db/database'

const REL = join('memory', 'procedural-memory.jsonl')

export function appendHabitLine(dataRoot: string, text: string): string {
  const dir = join(dataRoot, 'memory')
  mkdirSync(dir, { recursive: true })
  const file = join(dataRoot, REL)
  const ts = new Date().toISOString()
  const trimmed = text.trim()
  const line = JSON.stringify({ ts, text: trimmed }) + '\n'
  appendFileSync(file, line, 'utf-8')
  appendHabitToDb(dataRoot, trimmed, ts)
  return file
}

export function normalizeHabitKey(text: string): string {
  return text
    .trim()
    .replace(/[。.；;！!？?]/g, '')
    .replace(/\s+/g, '')
    .slice(0, 48)
    .toLowerCase()
}

export type HabitLine = { ts: string; text: string }

function readHabitLinesFromFile(dataRoot: string): HabitLine[] {
  const file = join(dataRoot, REL)
  if (!existsSync(file)) return []
  const lines: HabitLine[] = []
  for (const row of readFileSync(file, 'utf-8').split('\n')) {
    if (!row.trim()) continue
    try {
      const j = JSON.parse(row) as { ts?: string; text?: string }
      const text = typeof j.text === 'string' ? j.text.trim() : ''
      if (text) lines.push({ ts: j.ts ?? '', text })
    } catch {
      /* skip corrupt */
    }
  }
  return lines
}

export function readHabitLines(dataRoot: string): HabitLine[] {
  if (getDatabase(dataRoot)) {
    const fromDb = loadHabitsFromDb(dataRoot)
    if (fromDb.length > 0) return fromDb
  }
  const fromFile = readHabitLinesFromFile(dataRoot)
  if (fromFile.length > 0) {
    replaceHabitsInDb(dataRoot, fromFile)
  }
  return fromFile
}

export function countHabitOccurrences(dataRoot: string, text: string): number {
  const key = normalizeHabitKey(text)
  if (!key) return 0
  return readHabitLines(dataRoot).filter((l) => normalizeHabitKey(l.text) === key).length
}

export function isEstablishedHabit(dataRoot: string, text: string, minCount = 3): boolean {
  return countHabitOccurrences(dataRoot, text) >= minCount
}

export function listEstablishedHabits(dataRoot: string, minCount = 3): string[] {
  const counts = new Map<string, { count: number; text: string }>()
  for (const line of readHabitLines(dataRoot)) {
    const key = normalizeHabitKey(line.text)
    if (!key) continue
    const prev = counts.get(key) ?? { count: 0, text: line.text }
    counts.set(key, { count: prev.count + 1, text: line.text })
  }
  const out: string[] = []
  for (const { count, text } of counts.values()) {
    if (count >= minCount) out.push(text)
  }
  return out
}
