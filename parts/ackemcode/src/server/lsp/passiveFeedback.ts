/**
 * R5-LSPFEED · Passive diagnostics feedback (CC LSPDiagnosticRegistry /
 * getLSPDiagnosticAttachments spirit).
 *
 * After a successful file write/edit the loop notifies the matching LSP server
 * and collects fresh publishDiagnostics; the NEXT turn automatically sees newly
 * introduced errors/warnings without the model calling the `lsp` tool.
 * Everything here is best-effort: no LSP configured / server error / timeout →
 * silently skip, never block the turn.
 */
import path from 'node:path'
import type { LspDiagnostic } from './types.js'
import type { LspManager } from './manager.js'

/** Default collection window after an edit (ACKEM_LSP_FEEDBACK_TIMEOUT_MS). */
export const DEFAULT_LSP_FEEDBACK_TIMEOUT_MS = 2_000
/** Max diagnostics injected per turn (errors first). */
export const LSP_FEEDBACK_MAX_ITEMS = 20

/** Tools whose success means a file changed on disk. */
export const FILE_EDIT_TOOLS = new Set(['write_file', 'search_replace', 'notebook_edit'])

/** Extract the edited file's absolute path from a file-edit tool input, or null. */
export function editedFileFromToolInput(
  toolName: string,
  input: unknown,
  cwd: string
): string | null {
  if (!FILE_EDIT_TOOLS.has(toolName)) return null
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const p = o.path ?? o.file_path ?? o.notebook_path
  if (typeof p !== 'string' || !p) return null
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p)
}

export function resolveLspFeedbackTimeoutMs(): number {
  const raw = process.env.ACKEM_LSP_FEEDBACK_TIMEOUT_MS
  if (raw) {
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n) && n >= 0) return n
  }
  return DEFAULT_LSP_FEEDBACK_TIMEOUT_MS
}

/**
 * Dedupe registry: a diagnostic already surfaced to the model (same file,
 * position, severity, message) is never injected again this session.
 */
export class LspDiagnosticRegistry {
  private seen = new Set<string>()

  private key(d: LspDiagnostic): string {
    return `${d.uri}|${d.line}|${d.character}|${d.severity ?? 0}|${d.message}`
  }

  /** Returns only diagnostics not yet surfaced, marking them as seen. */
  takeNew(diags: readonly LspDiagnostic[]): LspDiagnostic[] {
    const out: LspDiagnostic[] = []
    for (const d of diags) {
      const k = this.key(d)
      if (this.seen.has(k)) continue
      this.seen.add(k)
      out.push(d)
    }
    return out
  }

  size(): number {
    return this.seen.size
  }
}

function severityLabel(n?: number): string {
  switch (n) {
    case 1:
      return 'error'
    case 2:
      return 'warning'
    case 3:
      return 'info'
    case 4:
      return 'hint'
    default:
      return 'unknown'
  }
}

function uriToDisplayPath(uri: string): string {
  try {
    if (uri.startsWith('file://')) {
      return decodeURIComponent(new URL(uri).pathname).replace(/^\/([A-Za-z]:)/, '$1')
    }
  } catch {
    /* fall through */
  }
  return uri
}

/**
 * Format new diagnostics for injection: errors before warnings, capped at
 * LSP_FEEDBACK_MAX_ITEMS with a truncation note. Empty input → null.
 */
export function formatLspFeedback(
  diags: readonly LspDiagnostic[],
  maxItems = LSP_FEEDBACK_MAX_ITEMS
): string | null {
  if (!diags.length) return null
  let list = [...diags]
  if (process.env.ACKEM_LSP_FEEDBACK_ERRORS_ONLY === '1') {
    list = list.filter((d) => d.severity === 1)
    if (!list.length) return null
  }
  const sorted = list.sort(
    (a, b) => (a.severity ?? 9) - (b.severity ?? 9)
  )
  const shown = sorted.slice(0, maxItems)
  const lines = shown.map(
    (d) =>
      `- ${uriToDisplayPath(d.uri)}:${d.line}:${d.character} [${severityLabel(d.severity)}] ${d.message}` +
      (d.source ? ` (${d.source})` : '')
  )
  const truncated =
    sorted.length > maxItems
      ? `\n…and ${sorted.length - maxItems} more (run the lsp tool for the full list)`
      : ''
  return (
    '[lsp_diagnostics] New diagnostics after your recent edits:\n' +
    lines.join('\n') +
    truncated
  )
}

/**
 * Fire-and-await-later collection for one edited file. Returns diagnostics on
 * fresh publish, [] when the server explicitly cleared, null on skip/timeout.
 */
export async function collectFileDiagnostics(
  manager: LspManager,
  absPath: string,
  timeoutMs = resolveLspFeedbackTimeoutMs()
): Promise<LspDiagnostic[] | null> {
  try {
    if (!manager.isEnabled()) return null
    const proc = manager.pickServerForFile(absPath)
    if (!proc) return null
    const resolved = path.resolve(absPath)
    const sinceGen = proc.getDiagnosticsGeneration(resolved)
    await proc.notifyFileChanged(resolved)
    return await proc.waitForFileDiagnostics(resolved, sinceGen, timeoutMs)
  } catch {
    // Server start failure / IO error → silent skip (contract 3)
    return null
  }
}
