/**
 * Decide whether a shell tool call should be OS-sandboxed (CC shouldUseSandbox spirit).
 * excludedCommands is a convenience, not a security boundary.
 */
import type { AckemSandboxSettings } from './types.js'

export type SandboxToolInput = {
  command?: string
  dangerouslyDisableSandbox?: boolean
}

function matchExcluded(command: string, patterns: string[]): boolean {
  const trimmed = command.trim()
  if (!trimmed || !patterns.length) return false
  // Split on && / || / ; for compound commands (lightweight; not a full bash parser)
  const parts = trimmed.split(/\s*(?:&&|\|\||;)\s*/)
  for (const part of parts) {
    const cand = part.trim()
    if (!cand) continue
    for (const pattern of patterns) {
      const p = pattern.trim()
      if (!p) continue
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -2)
        if (cand === prefix || cand.startsWith(prefix + ' ')) return true
        continue
      }
      if (p.includes('*')) {
        const escaped = p
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')
        try {
          if (new RegExp(`^${escaped}$`, 'i').test(cand)) return true
        } catch {
          /* ignore bad pattern */
        }
        continue
      }
      if (cand === p || cand.toLowerCase() === p.toLowerCase()) return true
    }
  }
  return false
}

export function shouldUseSandbox(opts: {
  sandboxEnabled: boolean
  allowUnsandboxedCommands: boolean
  excludedCommands: string[]
  input: SandboxToolInput
}): boolean {
  if (!opts.sandboxEnabled) return false
  if (
    opts.input.dangerouslyDisableSandbox &&
    opts.allowUnsandboxedCommands
  ) {
    return false
  }
  const command = opts.input.command
  if (!command?.trim()) return false
  if (matchExcluded(command, opts.excludedCommands)) return false
  return true
}

export function shouldUseSandboxFromSettings(
  sandbox: AckemSandboxSettings,
  sandboxingActive: boolean,
  input: SandboxToolInput
): boolean {
  return shouldUseSandbox({
    sandboxEnabled: sandboxingActive,
    allowUnsandboxedCommands: sandbox.allowUnsandboxedCommands !== false,
    excludedCommands: sandbox.excludedCommands ?? [],
    input
  })
}
