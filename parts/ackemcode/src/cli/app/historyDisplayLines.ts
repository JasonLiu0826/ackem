/**
 * Single source of truth: plain terminal lines for history items.
 * Used for scroll windowing, mouse selection row map, and copy text.
 */
import type { HistoryItem, ToolEntry } from './historyTypes.js'
import { collapseReadToolsForCli } from '../../shared/thoughtCollapse.js'
import {
  terminalMarkdownFlatLines,
  terminalMarkdownStyledLines,
  type StyledMarkdownLine
} from './TerminalMarkdown.js'
import { l } from './language.js'
import { formatThoughtDuration } from './logo.js'
import {
  PROMPT_PREFIX,
  padToDisplayWidth,
  promptWrapWidth,
  stringDisplayWidth,
  wrapPromptLines
} from './textWidth.js'

const THINKING_MAX_LINES = 40

function wrapDisplayLines(
  text: string,
  width: number,
  maxLines: number
): { lines: string[]; clipped: boolean } {
  const lines: string[] = []
  const w = Math.max(8, width)
  const paras = text.replace(/\r\n/g, '\n').split('\n')
  for (let pi = 0; pi < paras.length; pi++) {
    const para = paras[pi]!
    if (!para) {
      lines.push('')
      if (lines.length >= maxLines) return { lines, clipped: pi < paras.length - 1 }
      continue
    }
    let buf = ''
    let bufW = 0
    for (const ch of [...para]) {
      const cw = stringDisplayWidth(ch)
      if (buf && bufW + cw > w) {
        lines.push(buf)
        if (lines.length >= maxLines) return { lines, clipped: true }
        buf = ch
        bufW = cw
      } else {
        buf += ch
        bufW += cw
      }
    }
    lines.push(buf)
    if (lines.length >= maxLines) return { lines, clipped: pi < paras.length - 1 }
  }
  return { lines, clipped: false }
}

const WSL_NOISE =
  /execvpe\(\/bin\/bash\)|WSL.*ERROR|Relay.*ERROR|CreateProcessCommon|localhost.*WSL|�hKm0R/i

function sanitizeToolOutput(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((ln) => ln.trimEnd())
    .filter((ln) => ln.trim() && !WSL_NOISE.test(ln))
    .join('\n')
    .trim()
}

function toolOutputPreview(te: ToolEntry): { lineCount: number; preview: string } {
  const lines = sanitizeToolOutput(te.output).split('\n').filter(Boolean)
  if (!lines.length) return { lineCount: 0, preview: '' }
  return { lineCount: lines.length, preview: lines[0]! }
}

function toolGroupExpanded(tools: ToolEntry[]): boolean {
  return tools.some((t) => t.expanded)
}

export function styledLinesForHistoryItem(
  it: HistoryItem,
  cols: number
): StyledMarkdownLine[] {
  if (it.kind === 'assistant') return terminalMarkdownStyledLines(it.text, cols)
  if (it.kind === 'you') {
    const width = promptWrapWidth(cols)
    return wrapPromptLines(PROMPT_PREFIX + it.text, cols).map((line, index) => {
      const text = padToDisplayWidth(line, width)
      const spans =
        index === 0 && text.startsWith(PROMPT_PREFIX)
          ? [
              { text: PROMPT_PREFIX, tone: 'fgMuted' as const },
              { text: text.slice(PROMPT_PREFIX.length), tone: 'fg' as const }
            ]
          : [{ text, tone: 'fg' as const }]
      return { text, spans, bar: 'user' as const }
    })
  }
  if (
    it.kind === 'thought' ||
    it.kind === 'tool' ||
    it.kind === 'feedback' ||
    it.kind === 'tool_group' ||
    it.kind === 'steps'
  ) {
    return linesForHistoryItem(it, cols).map((text, index) => ({
      text,
      spans: [{ text, tone: index === 0 ? 'fgMuted' : 'fgDim' }]
    }))
  }
  return linesForHistoryItem(it, cols).map((text) => ({
    text,
    spans: [{ text, tone: it.kind === 'status' ? 'fgMuted' : 'fg' }]
  }))
}

export function linesForHistoryItem(it: HistoryItem, cols: number): string[] {
  if (it.kind === 'you') {
    return wrapPromptLines(PROMPT_PREFIX + it.text, cols)
  }
  if (it.kind === 'assistant') {
    return terminalMarkdownFlatLines(it.text, cols)
  }
  if (it.kind === 'status') {
    const w = Math.max(16, cols - 2)
    const out: string[] = []
    for (const ln of it.text.replace(/\r\n/g, '\n').split('\n')) {
      const chunk = ln || ' '
      if (stringDisplayWidth(chunk) <= w) out.push(chunk)
      else {
        let rest = chunk
        while (rest) {
          const piece =
            stringDisplayWidth(rest) <= w
              ? rest
              : (() => {
                  let buf = ''
                  let bufW = 0
                  for (const ch of [...rest]) {
                    const cw = stringDisplayWidth(ch)
                    if (buf && bufW + cw > w) break
                    buf += ch
                    bufW += cw
                  }
                  return buf || rest.slice(0, 1)
                })()
          out.push(piece)
          rest = rest.slice(piece.length)
        }
      }
    }
    return out.length ? out : [' ']
  }
  if (it.kind === 'tool') {
    const te = it.tool
    const { lineCount, preview } = toolOutputPreview(te)
    const head = `${te.name}${te.summary ? `  ${te.summary}` : ''}`
    const extra =
      !te.expanded && lineCount > 1
        ? l(` · 另有 ${lineCount - 1} 行`, ` · +${lineCount - 1} lines`)
        : !te.expanded && !preview && te.state === 'error'
          ? l(' · 失败', ' · failed')
          : ''
    const suffix = te.rolledBack
      ? l(' · 已回滚', ' · rolled back')
      : te.cancelled
        ? l(' · 已取消', ' · cancelled')
        : ''
    const waiting = te.state === 'waiting' ? l(' 等待确认…', ' waiting…') : ''
    const lines: string[] = [
      `● ${head}${waiting}${suffix}${!te.expanded ? extra : ''} ›`
    ]
    if (!te.expanded && preview) {
      lines.push(
        `  ${preview.slice(0, Math.max(20, cols - 16))}${
          lineCount > 1 ? l(` … 另有 ${lineCount - 1} 行`, ` … +${lineCount - 1} lines`) : ''
        }`
      )
    }
    if (te.expanded) {
      const body = sanitizeToolOutput(te.output).split('\n').filter(Boolean)
      const cap = 6
      for (const ln of body.slice(0, cap)) lines.push(`  ${ln}`)
      if (body.length > cap) {
        lines.push(
          l(`  …（另有 ${body.length - cap} 行）`, `  … (+${body.length - cap} lines)`)
        )
      }
    }
    return lines
  }
  if (it.kind === 'feedback') {
    const fb = it.feedback
    const fbLines = sanitizeToolOutput(fb.output).split('\n').filter(Boolean)
    const lineCount = fbLines.length
    const preview = fbLines[0] ?? ''
    const head = `${fb.toolName}${fb.path ? `  ${fb.path}` : ''}`
    const mark = fb.expanded ? '▾' : '›'
    const lines: string[] = []
    if (fb.expanded) {
      lines.push(`● ${head}${fb.ok ? '' : l(' 失败', ' failed')} ${mark}`)
      const body = sanitizeToolOutput(fb.output).split('\n').filter(Boolean)
      const cap = 6
      for (const ln of body.slice(0, cap)) lines.push(`  ${ln}`)
      if (body.length > cap) {
        lines.push(
          l(`  …（另有 ${body.length - cap} 行）`, `  … (+${body.length - cap} lines)`)
        )
      }
    } else {
      lines.push(
        `● ${head}${fb.ok ? '' : l(' 失败', ' failed')}  ${
          preview ? preview.slice(0, Math.max(16, cols - 24)) : ''
        }${lineCount > 1 ? l(` · 另有 ${lineCount - 1} 行`, ` · +${lineCount - 1} lines`) : preview ? '' : l(' ·（空）', ' · (empty)')} ${mark}`
      )
    }
    return lines
  }
  if (it.kind === 'thought') {
    const th = it.thought
    const sec = Math.max(0, Math.floor(((th.endedAt ?? Date.now()) - th.startedAt) / 1000))
    const duration = l(
      `思考了 ${formatThoughtDuration(sec)}`,
      `thought for ${formatThoughtDuration(sec)}`
    )
    const suffix = th.rolledBack
      ? l(' · 已回滚', ' · rolled back')
      : th.cancelled
        ? l(' · 已取消', ' · cancelled')
        : ''
    const head = th.expanded
      ? l('∴ 思考中…', '∴ Thinking…')
      : l('∴ 思考', '∴ Thinking')
    const lines = [`${head}  ${duration}${suffix} ›`]
    if (th.expanded && th.thinking) {
      const body = wrapDisplayLines(th.thinking, Math.max(16, cols - 4), THINKING_MAX_LINES)
      for (const ln of body.lines) lines.push(`  ${ln || ' '}`)
      if (body.clipped) lines.push('  …')
    }
    return lines
  }
  if (it.kind === 'steps') {
    const st = it.steps
    const suffix = st.rolledBack
      ? l(' · 已回滚', ' · rolled back')
      : st.cancelled
        ? l(' · 已取消', ' · cancelled')
        : ''
    const lines = [`${l('步骤', 'Steps')}  ${st.tools.length || 1}${suffix} ›`]
    if (st.expanded) {
      const toolRows = collapseReadToolsForCli(
        st.tools.map((t) => ({ name: t.name, path: t.path, input: undefined }))
      )
      for (const row of toolRows) lines.push(row.label)
      if (st.changed.length) {
        lines.push(`  ${l('已修改', 'Changed')}：${st.changed.join(', ')}`)
      }
    }
    return lines
  }
  if (it.kind === 'tool_group') {
    const expanded = toolGroupExpanded(it.tools)
    const suffix = it.tools.some((t) => t.rolledBack)
      ? l(' · 已回滚', ' · rolled back')
      : it.tools.some((t) => t.cancelled)
        ? l(' · 已取消', ' · cancelled')
        : ''
    const lines = [`● · ${it.label}${suffix} ›`]
    if (expanded) {
      for (const t of it.tools) {
        lines.push(`  ${t.name}${t.summary ? `  ${t.summary}` : ''}`)
      }
    }
    return lines
  }
  return [' ']
}

export function lineCountForHistoryItem(it: HistoryItem, cols: number, itemIndex: number): number {
  let n = linesForHistoryItem(it, cols).length
  if (it.kind === 'you' && itemIndex > 0) n += 1
  return Math.max(1, n)
}
