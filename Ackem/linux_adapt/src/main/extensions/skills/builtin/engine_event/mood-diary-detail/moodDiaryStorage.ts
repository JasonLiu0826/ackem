import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { localDateString } from '../../../../../context/localTime'

export type MoodDiaryEntry = {
  ts: string
  aff: number
  sec: number
  aro: number
  dom: number
  label: string
  turnHint: string
  affDelta: number
  secDelta: number
}

export function moodDiaryDir(dataRoot: string): string {
  return join(dataRoot, 'diary', 'mood')
}

export function appendMoodEntry(dataRoot: string, entry: MoodDiaryEntry, now = new Date()): string {
  const dir = moodDiaryDir(dataRoot)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = join(dir, `${localDateString(now)}.jsonl`)
  appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8')
  return file
}

export function isMoodSwing(affDelta: number, secDelta: number): boolean {
  return Math.abs(affDelta) >= 10 || Math.abs(secDelta) >= 15
}
