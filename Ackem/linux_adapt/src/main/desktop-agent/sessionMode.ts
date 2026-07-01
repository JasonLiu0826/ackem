import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type SessionModeFile = Record<string, boolean>

function modeFilePath(dataRoot: string): string {
  return join(dataRoot, 'desktop-agent', 'session-modes.json')
}

function readAll(dataRoot: string): SessionModeFile {
  const p = modeFilePath(dataRoot)
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as SessionModeFile
  } catch {
    return {}
  }
}

function writeAll(dataRoot: string, data: SessionModeFile): void {
  const p = modeFilePath(dataRoot)
  mkdirSync(join(dataRoot, 'desktop-agent'), { recursive: true })
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
}

export function getDesktopAgentChatMode(dataRoot: string, sessionId: string): boolean {
  return readAll(dataRoot)[sessionId] === true
}

export function setDesktopAgentChatMode(
  dataRoot: string,
  sessionId: string,
  enabled: boolean
): boolean {
  const all = readAll(dataRoot)
  if (enabled) all[sessionId] = true
  else delete all[sessionId]
  writeAll(dataRoot, all)
  return enabled
}

export function clearDesktopAgentChatModeForAllSessions(dataRoot: string): void {
  writeAll(dataRoot, {})
}
