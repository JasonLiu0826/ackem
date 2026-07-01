import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { saveDiaryToDb } from '../../../../db/repos/diary'
import type { DiaryMetaEntry } from './diaryTimeTypes'

export function saveDiary(dataRoot: string, date: string, content: string): string {
  const p = join(dataRoot, 'diary', `${date}.md`)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf-8')
  const meta = readDiaryMeta(dataRoot, date)
  saveDiaryToDb(dataRoot, date, content, meta ? JSON.stringify(meta) : null)
  return p
}

export function diaryExists(dataRoot: string, date: string): boolean {
  return existsSync(join(dataRoot, 'diary', `${date}.md`))
}

export function readDiaryMeta(dataRoot: string, date: string): DiaryMetaEntry | undefined {
  const metaPath = join(dataRoot, 'diary', 'meta.json')
  if (!existsSync(metaPath)) return undefined
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, DiaryMetaEntry>
    return meta[date]
  } catch {
    return undefined
  }
}

export function writeDiaryMeta(dataRoot: string, date: string, entry: DiaryMetaEntry): void {
  const diaryDir = join(dataRoot, 'diary')
  const metaPath = join(diaryDir, 'meta.json')
  mkdirSync(diaryDir, { recursive: true })
  let meta: Record<string, DiaryMetaEntry> = {}
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, DiaryMetaEntry>
    } catch {
      meta = {}
    }
  }
  meta[date] = entry
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
}
