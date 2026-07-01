import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localDateString } from '../../../../../context/localTime'

export type ScheduleAction = 'add' | 'list' | 'remove'

function scheduleDir(dataRoot: string): string {
  return join(dataRoot, 'schedule')
}

function scheduleFile(dataRoot: string): string {
  return join(scheduleDir(dataRoot), 'schedule.md')
}

function ensureScheduleFile(dataRoot: string): void {
  const dir = scheduleDir(dataRoot)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const file = scheduleFile(dataRoot)
  if (!existsSync(file)) writeFileSync(file, '# 轻量日程\n\n', 'utf8')
}

export function normalizeScheduleDate(input: string | undefined, now = new Date()): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim()
  return localDateString(now)
}

export function isAllowedScheduleDate(date: string, now = new Date()): boolean {
  const today = localDateString(now)
  const tomorrow = localDateString(new Date(now.getTime() + 24 * 60 * 60 * 1000))
  return date === today || date === tomorrow
}

function readFile(dataRoot: string): string {
  ensureScheduleFile(dataRoot)
  return readFileSync(scheduleFile(dataRoot), 'utf8')
}

function writeFile(dataRoot: string, content: string): void {
  ensureScheduleFile(dataRoot)
  writeFileSync(scheduleFile(dataRoot), content, 'utf8')
}

function sectionHeader(date: string): string {
  return `# ${date}`
}

export function listScheduleForDate(dataRoot: string, date: string): string[] {
  const text = readFile(dataRoot)
  const lines = text.split('\n')
  const header = sectionHeader(date)
  const items: string[] = []
  let inSection = false
  for (const line of lines) {
    if (line.trim() === header) {
      inSection = true
      continue
    }
    if (inSection && line.startsWith('# ')) break
    if (inSection && line.trim().startsWith('- [')) items.push(line.trim())
  }
  return items
}

export function addScheduleItem(
  dataRoot: string,
  date: string,
  time: string | undefined,
  content: string
): string {
  const text = readFile(dataRoot)
  const header = sectionHeader(date)
  const line = `- [ ] ${time ? `${time} ` : ''}${content.trim()}`
  if (!text.includes(header)) {
    writeFile(dataRoot, `${text.trimEnd()}\n\n${header}\n\n${line}\n`)
    return line
  }
  const parts = text.split(header)
  const head = parts[0] ?? ''
  const tail = parts[1] ?? ''
  writeFile(dataRoot, `${head}${header}${tail.trimEnd()}\n${line}\n`)
  return line
}

export function removeScheduleItem(dataRoot: string, date: string, needle: string): boolean {
  const items = listScheduleForDate(dataRoot, date)
  const target = items.find((item) => item.includes(needle.trim()))
  if (!target) return false
  const text = readFile(dataRoot)
  writeFile(dataRoot, text.replace(`${target}\n`, '').replace(target, ''))
  return true
}

export function formatScheduleList(date: string, items: string[]): string {
  if (items.length === 0) return `${date} 暂无安排。`
  return [`${date} 的安排：`, ...items.map((i) => i.replace(/^- \[ \] /, '· '))].join('\n')
}
