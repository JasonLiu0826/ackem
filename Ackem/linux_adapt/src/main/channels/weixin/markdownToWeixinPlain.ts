/** Markdown 纸面卡 → 微信可读纯文本（块式重排，非简单 strip） */

export type WeixinPlainBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean; checkbox?: boolean }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'rule' }
  | { kind: 'code'; text: string }

const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/
const HEADING_RE = /^(#{1,6})\s+(.+)$/
const UL_RE = /^[\s]*[-*+]\s+/
const OL_RE = /^[\s]*(\d+)[.)．、]\s+/
const CHECKBOX_RE = /^[\s]*[-*+]\s+\[([ xX])\]\s+/
const HR_RE = /^[\s]*(-{3,}|\*{3,}|_{3,})[\s]*$/
const CODE_FENCE_RE = /^```/

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim()
}

function parseTableRow(line: string): string[] | null {
  const m = line.match(TABLE_ROW_RE)
  if (!m) return null
  return m[1].split('|').map((c) => stripInlineMarkdown(c))
}

export function parseMarkdownBlocks(markdown: string): WeixinPlainBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: WeixinPlainBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i++
      continue
    }

    if (CODE_FENCE_RE.test(trimmed)) {
      i++
      const codeLines: string[] = []
      while (i < lines.length && !CODE_FENCE_RE.test(lines[i].trim())) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push({ kind: 'code', text: codeLines.join('\n').trim() })
      continue
    }

    if (HR_RE.test(trimmed)) {
      blocks.push({ kind: 'rule' })
      i++
      continue
    }

    const heading = trimmed.match(HEADING_RE)
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        text: stripInlineMarkdown(heading[2])
      })
      i++
      continue
    }

    if (TABLE_ROW_RE.test(trimmed)) {
      const headers = parseTableRow(trimmed)
      if (!headers) {
        i++
        continue
      }
      i++
      if (i < lines.length && TABLE_SEP_RE.test(lines[i].trim())) i++
      const rows: string[][] = []
      while (i < lines.length && TABLE_ROW_RE.test(lines[i].trim())) {
        const row = parseTableRow(lines[i].trim())
        if (row) rows.push(row)
        i++
      }
      blocks.push({ kind: 'table', headers, rows })
      continue
    }

    if (CHECKBOX_RE.test(line) || UL_RE.test(line) || OL_RE.test(line)) {
      const items: string[] = []
      let ordered = false
      let checkbox = false
      while (i < lines.length) {
        const l = lines[i]
        const t = l.trim()
        if (!t) break
        const cb = t.match(CHECKBOX_RE)
        if (cb) {
          checkbox = true
          items.push(stripInlineMarkdown(t.replace(CHECKBOX_RE, cb[1].toLowerCase() === 'x' ? '☑ ' : '□ ')))
          i++
          continue
        }
        if (UL_RE.test(l)) {
          items.push(stripInlineMarkdown(t.replace(UL_RE, '')))
          i++
          continue
        }
        const ol = t.match(OL_RE)
        if (ol) {
          ordered = true
          items.push(stripInlineMarkdown(t.replace(OL_RE, '')))
          i++
          continue
        }
        break
      }
      if (items.length) blocks.push({ kind: 'list', items, ordered, checkbox })
      continue
    }

    const paraLines: string[] = [stripInlineMarkdown(trimmed)]
    i++
    while (i < lines.length) {
      const t = lines[i].trim()
      if (
        !t ||
        HEADING_RE.test(t) ||
        TABLE_ROW_RE.test(t) ||
        UL_RE.test(lines[i]) ||
        OL_RE.test(lines[i]) ||
        CHECKBOX_RE.test(lines[i]) ||
        HR_RE.test(t) ||
        CODE_FENCE_RE.test(t)
      ) {
        break
      }
      paraLines.push(stripInlineMarkdown(t))
      i++
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join('\n') })
  }

  return blocks
}

function formatHeading(level: number, text: string): string {
  if (level <= 1) return `【${text}】`
  if (level === 2) return `【${text}】`
  return `▎${text}`
}

/** 2～4 列对比表 → 按对象分块 */
export function formatCompareTableForWeixin(headers: string[], rows: string[][]): string {
  const cols = headers.length
  if (cols < 2 || rows.length === 0) {
    return formatFlatTableForWeixin(headers, rows)
  }

  const titleParts = headers.slice(1).filter(Boolean)
  const title =
    titleParts.length >= 2
      ? `【对比：${titleParts.join(' vs ')}】`
      : headers[0]
        ? `【${headers[0]}】`
        : '【对比】'

  const blocks: string[] = [title]

  for (let c = 1; c < cols; c++) {
    const label = headers[c]?.trim() || `方案${c}`
    const lines = [`▎${label}`]
    for (const row of rows) {
      const dim = row[0]?.trim()
      const val = row[c]?.trim()
      if (!val) continue
      lines.push(dim ? `· ${dim}：${val}` : `· ${val}`)
    }
    if (lines.length > 1) blocks.push(lines.join('\n'))
  }

  return blocks.join('\n\n')
}

function formatFlatTableForWeixin(headers: string[], rows: string[][]): string {
  const lines: string[] = []
  if (headers.some((h) => h.trim())) {
    lines.push(`【${headers.filter(Boolean).join(' · ')}】`)
  }
  for (const row of rows) {
    const parts = row.map((c) => c.trim()).filter(Boolean)
    if (parts.length === 0) continue
    if (parts.length === 1) lines.push(`· ${parts[0]}`)
    else lines.push(`· ${parts[0]}：${parts.slice(1).join(' / ')}`)
  }
  return lines.join('\n')
}

function formatTableBlock(headers: string[], rows: string[][]): string {
  const cleanHeaders = headers.map((h) => h.trim())
  const isCompare =
    cleanHeaders.length >= 2 &&
    cleanHeaders.length <= 5 &&
    rows.length >= 1 &&
    rows.every((r) => r.length >= cleanHeaders.length)

  if (isCompare && cleanHeaders.length >= 2) {
    return formatCompareTableForWeixin(cleanHeaders, rows)
  }
  return formatFlatTableForWeixin(cleanHeaders, rows)
}

function formatListBlock(block: WeixinPlainBlock & { kind: 'list' }): string {
  const { items, ordered, checkbox } = block
  return items
    .map((item, idx) => {
      const body = item.replace(/^[☑□]\s*/, '').trim()
      if (checkbox) {
        const mark = item.startsWith('☑') ? '☑' : '□'
        return `${mark} ${body}`
      }
      if (ordered) {
        const n = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'][idx] ?? `${idx + 1}.`
        return `${n} ${body}`
      }
      return `· ${body}`
    })
    .join('\n')
}

export function blocksToWeixinPlain(blocks: WeixinPlainBlock[]): string {
  const parts: string[] = []

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        parts.push(formatHeading(block.level, block.text))
        break
      case 'paragraph':
        if (block.text) parts.push(block.text)
        break
      case 'list':
        parts.push(formatListBlock(block))
        break
      case 'table':
        parts.push(formatTableBlock(block.headers, block.rows))
        break
      case 'rule':
        parts.push('────────')
        break
      case 'code':
        if (block.text) parts.push(block.text)
        break
      default:
        break
    }
  }

  return parts
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function markdownToWeixinPlain(markdown: string): string {
  if (!markdown.trim()) return ''
  return blocksToWeixinPlain(parseMarkdownBlocks(markdown))
}

/** 按语义块切分为微信 bubble 正文（文档模式） */
export function splitWeixinDocumentChunks(plain: string, maxChars = 450): string[] {
  const trimmed = plain.trim()
  if (!trimmed) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const sections = trimmed.split(/\n\n+/)
  const chunks: string[] = []
  let buf = ''

  const flush = () => {
    if (buf.trim()) chunks.push(buf.trim())
    buf = ''
  }

  for (const sec of sections) {
    const s = sec.trim()
    if (!s) continue

    if (s.length > maxChars) {
      flush()
      let rest = s
      while (rest.length > maxChars) {
        const cut = rest.lastIndexOf('\n', maxChars)
        const at = cut > maxChars * 0.4 ? cut : maxChars
        chunks.push(rest.slice(0, at).trim())
        rest = rest.slice(at).trim()
      }
      if (rest) buf = rest
      continue
    }

    if (buf && buf.length + s.length + 2 > maxChars) flush()
    buf = buf ? `${buf}\n\n${s}` : s
  }
  flush()

  return chunks.filter(Boolean)
}
