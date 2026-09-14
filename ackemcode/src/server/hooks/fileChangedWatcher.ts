/**
 * FileChanged / CwdChanged watcher — Claude Code utils/hooks/fileChangedWatcher spirit.
 * Uses Node fs.watch (no chokidar dep); debounce approximates awaitWriteFinish.
 */
import {
  existsSync,
  mkdirSync,
  watch,
  type FSWatcher
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { AggregatedHookResult, HooksConfig } from './types.js'
import { resolveFileChangedMatcherPaths } from './match.js'
import { runHooks } from './runner.js'
import { clearCwdEnvFiles } from './sessionEnv.js'

export type FileChangedEvent = 'change' | 'add' | 'unlink'

type NotifyFn = (text: string, isError: boolean) => void

let currentCwd = process.cwd()
let hooksConfig: HooksConfig | undefined
let hooksDisabled = false
let sessionId = 'session'
let permissionMode: string | undefined
let dynamicWatchPaths: string[] = []
let dynamicWatchPathsSorted: string[] = []
let initialized = false
let notifyCallback: NotifyFn | null = null

/** parentDir → FSWatcher */
const dirWatchers = new Map<string, FSWatcher>()
/** Resolved absolute paths currently expected */
let watchedAbs = new Set<string>()
/** Debounce timers per path */
const pending = new Map<string, ReturnType<typeof setTimeout>>()
const STABILITY_MS = 500

export function setFileChangedNotifier(cb: NotifyFn | null): void {
  notifyCallback = cb
}

export function getFileChangedWatcherState(): {
  initialized: boolean
  cwd: string
  watched: string[]
  dynamic: string[]
} {
  return {
    initialized,
    cwd: currentCwd,
    watched: [...watchedAbs],
    dynamic: [...dynamicWatchPaths]
  }
}

/**
 * Initialize or refresh watcher from hooks config snapshot.
 * Safe to call repeatedly when settings change.
 */
export function initializeFileChangedWatcher(opts: {
  cwd: string
  config?: HooksConfig
  disabled?: boolean
  sessionId?: string
  permissionMode?: string
}): void {
  currentCwd = resolve(opts.cwd || process.cwd())
  hooksConfig = opts.config
  hooksDisabled = opts.disabled === true
  if (opts.sessionId) sessionId = opts.sessionId
  if (opts.permissionMode !== undefined) permissionMode = opts.permissionMode
  initialized = true
  restartWatching()
}

export function updateHooksConfigForWatcher(
  config: HooksConfig | undefined,
  disabled?: boolean
): void {
  hooksConfig = config
  if (disabled !== undefined) hooksDisabled = disabled
  if (initialized) restartWatching()
}

export function updateWatchPaths(paths: string[]): void {
  if (!initialized) return
  const abs = paths
    .filter((p) => typeof p === 'string' && p.trim())
    .map((p) => (isAbsolute(p) ? resolve(p) : resolve(currentCwd, p)))
  const sorted = [...new Set(abs)].slice().sort()
  if (
    sorted.length === dynamicWatchPathsSorted.length &&
    sorted.every((p, i) => p === dynamicWatchPathsSorted[i])
  ) {
    return
  }
  dynamicWatchPaths = sorted
  dynamicWatchPathsSorted = sorted
  restartWatching()
}

function resolveWatchPaths(): string[] {
  const staticPaths = resolveFileChangedMatcherPaths(
    hooksConfig?.FileChanged,
    currentCwd
  )
  return [...new Set([...staticPaths, ...dynamicWatchPaths].map((p) => resolve(p)))]
}

function restartWatching(): void {
  disposeDirWatchers()
  watchedAbs = new Set(resolveWatchPaths())
  if (watchedAbs.size === 0) return

  const byDir = new Map<string, Set<string>>()
  for (const abs of watchedAbs) {
    const dir = dirname(abs)
    if (!byDir.has(dir)) byDir.set(dir, new Set())
    byDir.get(dir)!.add(basename(abs))
  }

  for (const [dir, names] of byDir) {
    try {
      if (!existsSync(dir)) {
        try {
          mkdirSync(dir, { recursive: true })
        } catch {
          continue
        }
      }
      const w = watch(dir, { persistent: false }, (eventType, filename) => {
        if (!filename) return
        const name = filename.toString()
        if (!names.has(name)) return
        const full = resolve(join(dir, name))
        scheduleFileEvent(full, eventType === 'rename' ? 'maybe' : 'change')
      })
      w.on('error', () => {
        /* ignore ephemeral watch errors */
      })
      dirWatchers.set(dir, w)
    } catch {
      /* skip unwatchable dirs */
    }
  }
}

function scheduleFileEvent(
  absPath: string,
  kind: 'change' | 'maybe'
): void {
  const key = resolve(absPath)
  const prev = pending.get(key)
  if (prev) clearTimeout(prev)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      const exists = existsSync(key)
      let event: FileChangedEvent
      if (kind === 'maybe') {
        event = exists ? 'add' : 'unlink'
      } else {
        event = exists ? 'change' : 'unlink'
      }
      void handleFileEvent(key, event)
    }, STABILITY_MS)
  )
}

async function handleFileEvent(
  filePath: string,
  event: FileChangedEvent
): Promise<void> {
  if (!initialized || hooksDisabled) return
  if (!hooksConfig?.FileChanged?.length) return

  try {
    const result = await executeFileChangedHooks(filePath, event)
    if (result.watchPaths.length > 0) {
      updateWatchPaths(result.watchPaths)
    }
    for (const msg of result.additionalContext) {
      notifyCallback?.(msg, false)
    }
    for (const r of result.results) {
      if (!r.blocking && r.exitCode !== 0 && r.stderr.trim()) {
        notifyCallback?.(r.stderr.trim(), true)
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    notifyCallback?.(msg, true)
  }
}

export async function executeFileChangedHooks(
  filePath: string,
  event: FileChangedEvent
): Promise<AggregatedHookResult> {
  return runHooks({
    event: 'FileChanged',
    config: hooksConfig,
    disabled: hooksDisabled,
    cwd: currentCwd,
    input: {
      session_id: sessionId,
      cwd: currentCwd,
      permission_mode: permissionMode,
      hook_event_name: 'FileChanged',
      file_path: resolve(filePath),
      event
    }
  })
}

export async function executeCwdChangedHooks(
  oldCwd: string,
  newCwd: string
): Promise<AggregatedHookResult> {
  return runHooks({
    event: 'CwdChanged',
    config: hooksConfig,
    disabled: hooksDisabled,
    cwd: newCwd,
    input: {
      session_id: sessionId,
      cwd: newCwd,
      permission_mode: permissionMode,
      hook_event_name: 'CwdChanged',
      old_cwd: oldCwd,
      new_cwd: newCwd
    }
  })
}

/**
 * After session cwd changes (enter/exit worktree, etc.).
 */
export async function onCwdChangedForHooks(
  oldCwd: string,
  newCwd: string
): Promise<AggregatedHookResult> {
  if (oldCwd === newCwd) {
    return {
      blocking: false,
      blockMessage: '',
      additionalContext: [],
      preventContinuation: false,
      watchPaths: [],
      results: []
    }
  }
  const hasEnvHooks =
    (hooksConfig?.CwdChanged?.length ?? 0) > 0 ||
    (hooksConfig?.FileChanged?.length ?? 0) > 0
  if (!hasEnvHooks) {
    currentCwd = resolve(newCwd)
    return {
      blocking: false,
      blockMessage: '',
      additionalContext: [],
      preventContinuation: false,
      watchPaths: [],
      results: []
    }
  }

  currentCwd = resolve(newCwd)
  // CC: clear cwd/file env files before CwdChanged hooks re-write them
  await clearCwdEnvFiles(sessionId).catch(() => {})
  const hookResult = await executeCwdChangedHooks(oldCwd, newCwd).catch(
    (e) => {
      const msg = e instanceof Error ? e.message : String(e)
      notifyCallback?.(msg, true)
      return {
        blocking: false,
        blockMessage: '',
        additionalContext: [] as string[],
        preventContinuation: false,
        watchPaths: [] as string[],
        results: []
      }
    }
  )
  dynamicWatchPaths = hookResult.watchPaths.map((p) =>
    isAbsolute(p) ? resolve(p) : resolve(currentCwd, p)
  )
  dynamicWatchPathsSorted = dynamicWatchPaths.slice().sort()
  for (const msg of hookResult.additionalContext) {
    notifyCallback?.(msg, false)
  }
  if (initialized) restartWatching()
  return hookResult
}

function disposeDirWatchers(): void {
  for (const [, w] of dirWatchers) {
    try {
      w.close()
    } catch {
      /* ignore */
    }
  }
  dirWatchers.clear()
  for (const t of pending.values()) clearTimeout(t)
  pending.clear()
}

export function disposeFileChangedWatcher(): void {
  disposeDirWatchers()
  dynamicWatchPaths = []
  dynamicWatchPathsSorted = []
  watchedAbs = new Set()
  initialized = false
  notifyCallback = null
}

/** Test helper */
export function resetFileChangedWatcherForTesting(): void {
  disposeFileChangedWatcher()
  hooksConfig = undefined
  hooksDisabled = false
  sessionId = 'session'
  permissionMode = undefined
  currentCwd = process.cwd()
}

/** Test helper: run FileChanged hooks without waiting on fs.watch. */
export async function __testFireFileChanged(
  filePath: string,
  event: FileChangedEvent
): Promise<AggregatedHookResult> {
  const result = await executeFileChangedHooks(filePath, event)
  if (result.watchPaths.length > 0) updateWatchPaths(result.watchPaths)
  return result
}
