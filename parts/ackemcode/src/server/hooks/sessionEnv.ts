/**
 * Session hook env files — Claude Code sessionEnvironment / CLAUDE_ENV_FILE spirit.
 * Hooks on SessionStart|Setup|CwdChanged|FileChanged may write export lines to a
 * per-hook file; Ackem merges them into subsequent tool/hook child env.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { HookEventName } from './types.js'

export const ENV_FILE_HOOK_EVENTS = [
  'Setup',
  'SessionStart',
  'CwdChanged',
  'FileChanged'
] as const

export type EnvFileHookEvent = (typeof ENV_FILE_HOOK_EVENTS)[number]

export function isEnvFileHookEvent(
  event: string
): event is EnvFileHookEvent {
  return (ENV_FILE_HOOK_EVENTS as readonly string[]).includes(event)
}

const HOOK_ENV_PRIORITY: Record<string, number> = {
  setup: 0,
  sessionstart: 1,
  cwdchanged: 2,
  filechanged: 3
}

const HOOK_ENV_REGEX =
  /^(setup|sessionstart|cwdchanged|filechanged)-hook-(\d+)\.(sh|env)$/i

/** Cache: undefined = not loaded; null = empty; Record = parsed exports */
let cachedExports: Record<string, string> | null | undefined

let activeSessionId = 'session'

export function setSessionEnvSessionId(sessionId: string): void {
  if (sessionId && sessionId !== activeSessionId) {
    activeSessionId = sessionId
    invalidateSessionEnvCache()
  } else if (sessionId) {
    activeSessionId = sessionId
  }
}

export function getSessionEnvSessionId(): string {
  return activeSessionId
}

export function invalidateSessionEnvCache(): void {
  cachedExports = undefined
}

function ackHome(): string {
  return (
    process.env.ACKEM_HOME?.trim() ||
    path.join(os.homedir(), '.ackemcode')
  )
}

export async function getSessionEnvDirPath(
  sessionId: string = activeSessionId
): Promise<string> {
  const dir = path.join(ackHome(), 'session-env', sessionId || 'session')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function getHookEnvFilePath(
  hookEvent: EnvFileHookEvent,
  hookIndex: number,
  sessionId: string = activeSessionId
): Promise<string> {
  const prefix = hookEvent.toLowerCase()
  const ext = process.platform === 'win32' ? 'env' : 'sh'
  return path.join(
    await getSessionEnvDirPath(sessionId),
    `${prefix}-hook-${hookIndex}.${ext}`
  )
}

/** Clear CwdChanged/FileChanged env files (CC clearCwdEnvFiles spirit). */
export async function clearCwdEnvFiles(
  sessionId: string = activeSessionId
): Promise<void> {
  try {
    const dir = await getSessionEnvDirPath(sessionId)
    const files = await fs.readdir(dir)
    await Promise.all(
      files
        .filter(
          (f) =>
            /^(filechanged|cwdchanged)-hook-\d+\.(sh|env)$/i.test(f)
        )
        .map((f) => fs.writeFile(path.join(dir, f), ''))
    )
    invalidateSessionEnvCache()
  } catch {
    /* ignore missing dir */
  }
}

/**
 * Parse bash-style export lines from hook env files.
 * Supports: export KEY=VAL | KEY=VAL | export KEY="VAL"
 */
export function parseEnvExportLines(script: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m) continue
    let val = m[2]!.trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[m[1]!] = val
  }
  return out
}

function sortHookEnvFiles(a: string, b: string): number {
  const aMatch = a.match(HOOK_ENV_REGEX)
  const bMatch = b.match(HOOK_ENV_REGEX)
  const aType = (aMatch?.[1] || '').toLowerCase()
  const bType = (bMatch?.[1] || '').toLowerCase()
  if (aType !== bType) {
    return (HOOK_ENV_PRIORITY[aType] ?? 99) - (HOOK_ENV_PRIORITY[bType] ?? 99)
  }
  return (
    parseInt(aMatch?.[2] || '0', 10) - parseInt(bMatch?.[2] || '0', 10)
  )
}

/**
 * Load + merge session env exports (priority: setup → sessionstart → cwd → file).
 * Also includes parent process.env.CLAUDE_ENV_FILE / ACKEM_ENV_FILE contents.
 */
export async function loadSessionEnvExports(
  sessionId: string = activeSessionId
): Promise<Record<string, string>> {
  if (cachedExports !== undefined) {
    return { ...(cachedExports || {}) }
  }

  const merged: Record<string, string> = {}

  const parentFile =
    process.env.ACKEM_ENV_FILE?.trim() ||
    process.env.CLAUDE_ENV_FILE?.trim()
  if (parentFile) {
    try {
      const body = (await fs.readFile(parentFile, 'utf8')).trim()
      Object.assign(merged, parseEnvExportLines(body))
    } catch {
      /* missing parent file ok */
    }
  }

  try {
    const dir = await getSessionEnvDirPath(sessionId)
    const files = (await fs.readdir(dir))
      .filter((f) => HOOK_ENV_REGEX.test(f))
      .sort(sortHookEnvFiles)
    for (const file of files) {
      try {
        const body = (await fs.readFile(path.join(dir, file), 'utf8')).trim()
        if (body) Object.assign(merged, parseEnvExportLines(body))
      } catch {
        /* skip */
      }
    }
  } catch {
    /* no dir */
  }

  cachedExports = Object.keys(merged).length ? merged : null
  return { ...merged }
}

/** Sync-friendly snapshot for spawn env (loads if cache cold). */
export async function getSessionHookEnvVars(
  sessionId?: string
): Promise<Record<string, string>> {
  return loadSessionEnvExports(sessionId ?? activeSessionId)
}

export function shouldPassClaudeEnvFile(opts: {
  event: HookEventName | string
  shell?: string
}): boolean {
  if (!isEnvFileHookEvent(opts.event)) return false
  // CC: PowerShell hooks do not get CLAUDE_ENV_FILE
  if ((opts.shell || 'bash').toLowerCase() === 'powershell') return false
  return true
}
