/**
 * R3 contract 3 · Post-compact reinjection (CC createPostCompactFileAttachments spirit).
 *
 * After a FULL compact, re-attach what the agent was actually working on so the
 * next turn doesn't start blind: the most recently touched files (snippet
 * re-read from disk, skipped when mtime says the copy is stale) plus the
 * current todos. Never throws — reinjection is best-effort.
 */
import { readFile, stat } from 'node:fs/promises'
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import type { ReadFileState } from '../../tools/files/readFileState.js'
import type { TodoItem } from '../todos.js'

export const POST_COMPACT_REINJECT_FILES = 5
const SNIPPET_MAX_CHARS = 2_000
/** M4 — cap reinjection so post-compact user blob stays bounded. */
export const POST_COMPACT_MAX_TOTAL_CHARS = 8_000

export type PostCompactAttachmentOpts = {
  readFileState?: ReadFileState
  getTodos?: () => TodoItem[]
  /** Max files to reinject (default 5). */
  maxFiles?: number
  /** L5: scan recent tool failures for error lines. */
  recentMessages?: ChatMessage[]
}

const FAIL_TOOLS = new Set(['bash', 'powershell', 'search_replace', 'write_file'])

export function extractRecentToolErrors(
  messages: ChatMessage[],
  maxLines = 12
): string[] {
  const lines: string[] = []
  for (let i = messages.length - 1; i >= 0 && lines.length < maxLines; i--) {
    const m = messages[i]!
    if (m.role !== 'tool') continue
    const name = m.name || ''
    if (!FAIL_TOOLS.has(name)) continue
    const body = flattenMessageContent(m.content)
    if (!body || body.length > 8_000) continue
    if (!/\b(error|fail|FAIL|Error:|TS\d+|ENOENT|fatal:)\b/i.test(body)) continue
    for (const row of body.split(/\r?\n/)) {
      const t = row.trim()
      if (!t || t.length > 300) continue
      if (/\b(error|fail|FAIL|Error:|TS\d+|fatal:)\b/i.test(t)) {
        lines.push(`${name}: ${t}`)
        if (lines.length >= maxLines) break
      }
    }
  }
  return lines
}

/**
 * Build the reinjection user message after a full compact, or null when there
 * is nothing worth attaching.
 */
export async function buildPostCompactAttachments(
  opts: PostCompactAttachmentOpts
): Promise<ChatMessage | null> {
  const parts: string[] = []

  // --- recent files (mtime-verified snippets) ---
  const entries = opts.readFileState?.recent(
    opts.maxFiles ?? POST_COMPACT_REINJECT_FILES
  )
  if (entries?.length) {
    const fileBlocks: string[] = []
    for (const e of entries) {
      try {
        const st = await stat(e.path)
        if (st.mtimeMs !== e.mtimeMs) {
          // Changed on disk since the agent last saw it — path only, no stale snippet.
          fileBlocks.push(`- ${e.path} (changed on disk since last read — re-read before editing)`)
          continue
        }
        const raw = await readFile(e.path, 'utf8')
        const snippet =
          raw.length > SNIPPET_MAX_CHARS
            ? raw.slice(0, SNIPPET_MAX_CHARS) + '\n…(truncated)'
            : raw
        fileBlocks.push(`- ${e.path}\n\`\`\`\n${snippet}\n\`\`\``)
      } catch {
        // Deleted/unreadable → mention path only.
        fileBlocks.push(`- ${e.path} (no longer readable)`)
      }
    }
    if (fileBlocks.length) {
      parts.push(
        'Files you were working with before compaction (freshest first):\n' +
          fileBlocks.join('\n')
      )
    }
  }

  // --- current todos ---
  const todos = opts.getTodos?.() ?? []
  const open = todos.filter((t) => t.status !== 'completed')
  if (open.length) {
    parts.push(
      'Current todos:\n' +
        todos
          .map((t) => `- [${t.status}] ${t.content}`)
          .join('\n')
    )
  }

  const errLines = opts.recentMessages
    ? extractRecentToolErrors(opts.recentMessages)
    : []
  if (errLines.length) {
    parts.push(
      'Recent tool errors (still open until fixed):\n' + errLines.map((l) => `- ${l}`).join('\n')
    )
  }

  if (!parts.length) return null

  let body =
    '[Post-compact context] Reattached working state (not a user message):\n\n' +
    parts.join('\n\n')

  if (body.length > POST_COMPACT_MAX_TOTAL_CHARS) {
    const pathsOnly: string[] = []
    const entries = opts.readFileState?.recent(
      opts.maxFiles ?? POST_COMPACT_REINJECT_FILES
    )
    if (entries?.length) {
      pathsOnly.push(
        'Files you were working with (paths only — snippets omitted for size):\n' +
          entries.map((e) => `- ${e.path}`).join('\n')
      )
    }
    const slim: string[] = []
    const todos = opts.getTodos?.() ?? []
    if (todos.length) {
      slim.push(
        'Current todos:\n' +
          todos.map((t) => `- [${t.status}] ${t.content}`).join('\n')
      )
    }
    const errLines = opts.recentMessages
      ? extractRecentToolErrors(opts.recentMessages)
      : []
    if (errLines.length) {
      slim.push(
        'Recent tool errors (still open until fixed):\n' +
          errLines.map((l) => `- ${l}`).join('\n')
      )
    }
    if (pathsOnly.length) slim.unshift(pathsOnly[0]!)
    body =
      '[Post-compact context] Reattached working state (not a user message):\n\n' +
      slim.join('\n\n')
    if (body.length > POST_COMPACT_MAX_TOTAL_CHARS) {
      body = body.slice(0, POST_COMPACT_MAX_TOTAL_CHARS - 20) + '\n…(truncated)'
    }
  }

  return {
    role: 'user',
    content: body
  }
}
