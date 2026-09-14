/**
 * Fire-and-forget InstructionsLoaded hooks (CC claudemd / attachments spirit).
 * Non-blocking; failures ignored.
 */
import path from 'node:path'
import type { InstructionSource } from '../agent/context/projectInstructions.js'
import { runHooks } from './runner.js'
import type { HooksConfig } from './types.js'

export type InstructionsLoadedMemoryType =
  | 'User'
  | 'Project'
  | 'Local'
  | 'Managed'

export function inferInstructionMemoryType(
  absPath: string,
  relPath: string
): InstructionsLoadedMemoryType {
  const n = absPath.replace(/\\/g, '/').toLowerCase()
  if (
    relPath.startsWith('~/.claude') ||
    n.includes('/.claude/claude.md') ||
    n.endsWith('/.claude/claude.md')
  ) {
    return 'User'
  }
  if (n.includes('/.claude/rules/') || n.includes('/managed/')) {
    return 'Managed'
  }
  if (n.includes('/.claude/') || relPath.includes('.claude/')) {
    return 'Local'
  }
  return 'Project'
}

export async function emitInstructionsLoadedHooks(opts: {
  sources: InstructionSource[]
  cwd: string
  sessionId?: string
  config?: HooksConfig
  disabled?: boolean
  loadReason?:
    | 'session_start'
    | 'nested_traversal'
    | 'path_glob_match'
    | 'include'
    | 'compact'
}): Promise<number> {
  if (!opts.config || opts.disabled) return 0
  const groups = opts.config.InstructionsLoaded
  if (!Array.isArray(groups) || !groups.some((g) => g?.hooks?.length)) {
    return 0
  }
  let n = 0
  for (const s of opts.sources) {
    try {
      await runHooks({
        event: 'InstructionsLoaded',
        config: opts.config,
        disabled: opts.disabled,
        cwd: opts.cwd,
        input: {
          session_id: opts.sessionId || 'session',
          cwd: opts.cwd,
          hook_event_name: 'InstructionsLoaded',
          file_path: s.absPath,
          memory_type: inferInstructionMemoryType(s.absPath, s.relPath),
          load_reason: opts.loadReason ?? 'session_start'
        }
      })
      n += 1
    } catch {
      /* never block context assembly */
    }
  }
  return n
}

/** Test helper — path join without IO */
export function instructionDisplayPath(cwd: string, abs: string): string {
  const rel = path.relative(cwd, abs)
  return rel && !rel.startsWith('..') ? rel : abs
}
