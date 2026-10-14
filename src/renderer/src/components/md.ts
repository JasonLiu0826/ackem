// 轻量 Markdown → HTML 渲染器（日记专用，零依赖）

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderInline(text: string): string {
  return linkifyFilePaths(
    escapeHtml(text)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, (_match, label: string, rawUrl: string) => {
        try {
          const url = new URL(rawUrl.replace(/&amp;/g, '&'))
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return label
          const safeHref = escapeHtml(url.href).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
          return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`
        } catch { return label }
      })
      .replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (match, label: string, path: string) => {
        const clean = path.startsWith('&lt;') && path.endsWith('&gt;') ? path.slice(4, -4) : path
        return !/^[a-z]+:/i.test(clean) || /^[A-Za-z]:[\\/]/.test(clean) ? (EXACT_FILE_RE.test(clean) ? fileAnchor(clean, label) : match) : match
      })
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/`(.+?)`/g, '<code class="bg-surface-raised px-1 rounded text-xs">$1</code>')
  )
}

/**
 * 产出文件路径 → 可点击链接 (2026-10-04 用户反馈: 聊天里的文件要能直接打开)。
 * 只匹配带扩展名的多段相对/绝对路径 (staging/hello.txt、workspace\a\b.md),
 * 避免把日期、普通词组误判成路径; 已有 <a> 锚点内不再嵌套。
 * 实际打开由主进程 shell:revealPath 校验 (仅 data 根内), 不存在的路径点开提示。
 */
const FILE_EXT = '(?:txt|md|log|json|csv|ts|tsx|js|jsx|html|css|yaml|yml|xml|py|rs|go|sql|sh|bat|ps1|toml|ini|env|c|cpp|h|pdf|png|jpg|jpeg|svg|docx|xlsx)'
const FILE_PATH_RE = new RegExp(`(?<![\\p{L}\\p{N}_@:/.-])((?:[A-Za-z]:[\\\\/])?(?:[\\p{L}\\p{N}_().~@-]+[\\\\/])*[\\p{L}\\p{N}_().~-]+\\.${FILE_EXT})(?![\\p{L}\\p{N}_])`, 'giu')
const EXACT_FILE_RE = new RegExp(`^(?![a-z]+://).+\\.${FILE_EXT}$`, 'iu')
function fileAnchor(path: string, label = path): string {
  const safe = path.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  return `<a href="#" data-reveal-path="${safe}" class="md-file-link" title="预览文件">${label}</a>`
}

function linkifyFilePaths(html: string): string {
  // Never match tag attributes, existing links or fenced code. Inline code paths can contain spaces.
  return html.split(/(<a\s[^>]*>[\s\S]*?<\/a>|<code[^>]*>[\s\S]*?<\/code>|<[^>]+>)/g).map((part) => {
    if (part.startsWith('<a ')) return part
    if (part.startsWith('<code')) {
      return part.replace(/^(<code[^>]*>)([\s\S]*)(<\/code>)$/, (_match, start: string, text: string, end: string) =>
        !text.includes('<') && EXACT_FILE_RE.test(text) ? `${start}${fileAnchor(text)}${end}` : part)
    }
    if (part.startsWith('<')) return part
    return part.replace(FILE_PATH_RE, (path) => fileAnchor(path))
  }).join('')
}

function isTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableCells(line)
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
  )
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim()
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return inner.split('|').map((cell) => cell.trim())
}

function parseTableAlignments(separatorLine: string): Array<'left' | 'center' | 'right'> {
  return parseTableCells(separatorLine).map((cell) => {
    const compact = cell.replace(/\s/g, '')
    if (compact.startsWith(':') && compact.endsWith(':')) return 'center'
    if (compact.endsWith(':')) return 'right'
    return 'left'
  })
}

function alignClass(align: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}

function renderTable(headerLine: string, separatorLine: string, bodyLines: string[]): string {
  const headers = parseTableCells(headerLine)
  const alignments = parseTableAlignments(separatorLine)
  const rows = bodyLines.map(parseTableCells)

  const thead = headers
    .map(
      (cell, idx) =>
        `<th class="border-b border-surface-inset px-3 py-2 font-semibold ${alignClass(alignments[idx] ?? 'left')}">${renderInline(cell)}</th>`
    )
    .join('')

  const tbody = rows
    .map((cells) => {
      const tds = headers
        .map((_, idx) => {
          const align = alignments[idx] ?? 'left'
          const cell = cells[idx] ?? ''
          return `<td class="border-b border-surface-inset px-3 py-2 align-top last:border-b-0 ${alignClass(align)}">${renderInline(cell)}</td>`
        })
        .join('')
      return `<tr class="last:[&_td]:border-b-0">${tds}</tr>`
    })
    .join('')

  return [
    '<div class="overflow-x-auto my-3 rounded-lg border border-surface-inset">',
    '<table class="w-full min-w-[240px] border-collapse text-sm">',
    `<thead><tr class="bg-surface-raised">${thead}</tr></thead>`,
    tbody ? `<tbody>${tbody}</tbody>` : '',
    '</table>',
    '</div>'
  ].join('')
}

function parseTableBlock(
  lines: string[],
  startIndex: number
): { html: string; nextIndex: number } | null {
  const first = lines[startIndex]?.trim() ?? ''
  if (!isTableRow(first)) return null

  const tableLines: string[] = []
  let i = startIndex
  while (i < lines.length) {
    const trimmed = lines[i]?.trim() ?? ''
    if (!trimmed || !isTableRow(trimmed)) break
    tableLines.push(trimmed)
    i++
  }

  if (tableLines.length < 2 || !isTableSeparator(tableLines[1])) return null

  return {
    html: renderTable(tableLines[0], tableLines[1], tableLines.slice(2)),
    nextIndex: i
  }
}

/** Plan 方案摘要等无表头分隔行的 `| 键 | 值 |` 表格 */
function renderHeaderlessKeyValueTable(tableLines: string[]): string {
  const rows = tableLines.map(parseTableCells)
  const tbody = rows
    .map((cells) => {
      const key = cells[0] ?? ''
      const value = cells.slice(1).join(' | ')
      return [
        '<tr>',
        `<th class="w-[4.5rem] shrink-0 border-b border-surface-inset px-2 py-1.5 text-left text-xs font-normal text-ink-muted align-top">${renderInline(key)}</th>`,
        `<td class="border-b border-surface-inset px-2 py-1.5 text-xs text-ink align-top last:border-b-0">${renderInline(value)}</td>`,
        '</tr>'
      ].join('')
    })
    .join('')

  return [
    '<div class="overflow-x-auto my-1 rounded-lg border border-surface-inset/60">',
    '<table class="plan-kv-table w-full min-w-0 border-collapse text-sm">',
    `<tbody>${tbody}</tbody>`,
    '</table>',
    '</div>'
  ].join('')
}

function parseHeaderlessKeyValueTableBlock(
  lines: string[],
  startIndex: number
): { html: string; nextIndex: number } | null {
  const first = lines[startIndex]?.trim() ?? ''
  if (!isTableRow(first)) return null

  const tableLines: string[] = []
  let i = startIndex
  while (i < lines.length) {
    const trimmed = lines[i]?.trim() ?? ''
    if (!trimmed || !isTableRow(trimmed)) break
    if (isTableSeparator(trimmed)) break
    tableLines.push(trimmed)
    i++
  }

  if (tableLines.length === 0) return null

  return {
    html: renderHeaderlessKeyValueTable(tableLines),
    nextIndex: i
  }
}

export type RenderMarkdownOptions = {
  /** 聊天气泡：去掉 [SPLIT] / 独立 --- 行，不渲染 Markdown 横线 */
  chat?: boolean
}

/** 展示/持久化前清理 LLM 节奏分隔符（与 main/chat/pacedStreamEmitter 对齐） */
export function sanitizeChatAssistantText(text: string): string {
  return text
    .split('[SPLIT]')
    .join('')
    .split('\n')
    .filter((line) => !/^-{3,}$/.test(line.trim()))
    .join('\n')
    .trim()
}

export function renderMarkdown(md: string, options?: RenderMarkdownOptions): string {
  const source = options?.chat ? sanitizeChatAssistantText(md) : md
  const lines = source.split('\n')
  const html: string[] = []
  let inCodeBlock = false
  let codeBuf: string[] = []
  let codeLanguage = ''
  let listKind: 'ul' | 'ol' | null = null

  function closeList(): void {
    if (listKind === 'ul') html.push('</ul>')
    else if (listKind === 'ol') html.push('</ol>')
    listKind = null
  }

  function openList(kind: 'ul' | 'ol'): void {
    if (listKind === kind) return
    closeList()
    if (kind === 'ul') {
      html.push('<ul class="list-disc pl-5 my-1 space-y-0.5">')
    } else {
      html.push('<ol class="list-decimal pl-5 my-1 space-y-0.5">')
    }
    listKind = kind
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        html.push(
          `<pre data-language="${codeLanguage}" class="bg-surface-raised rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        )
        codeBuf = []
        inCodeBlock = false
      } else {
        closeList()
        inCodeBlock = true
        codeLanguage = trimmed.slice(3).trim().toLowerCase().replace(/[^a-z0-9#+-]/g, '')
      }
      continue
    }
    if (inCodeBlock) {
      codeBuf.push(raw)
      continue
    }

    if (!trimmed) {
      closeList()
      continue
    }

    if (isTableRow(trimmed)) {
      closeList()
      const second = lines[i + 1]?.trim() ?? ''
      if (isTableRow(second) && isTableSeparator(second)) {
        const table = parseTableBlock(lines, i)
        if (table) {
          html.push(table.html)
          i = table.nextIndex - 1
          continue
        }
      }
      const kvTable = parseHeaderlessKeyValueTableBlock(lines, i)
      if (kvTable) {
        html.push(kvTable.html)
        i = kvTable.nextIndex - 1
        continue
      }
    }

    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (hMatch) {
      closeList()
      const level = hMatch[1].length
      const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-xs', 'text-xs']
      const margins = ['mt-5 mb-2', 'mt-4 mb-2', 'mt-3 mb-1', 'mt-2 mb-1', 'mt-2 mb-1', 'mt-1 mb-1']
      html.push(
        `<h${level} class="${sizes[level - 1]} font-semibold ${margins[level - 1]} text-ink">${renderInline(hMatch[2])}</h${level}>`
      )
      continue
    }

    if (/^-{3,}$/.test(trimmed)) {
      closeList()
      if (!options?.chat) {
        html.push('<hr class="border-surface-inset my-3" />')
      }
      continue
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (ulMatch) {
      openList('ul')
      html.push(`<li class="text-sm text-ink">${renderInline(ulMatch[1])}</li>`)
      continue
    }

    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (olMatch) {
      openList('ol')
      html.push(`<li class="text-sm text-ink">${renderInline(olMatch[1])}</li>`)
      continue
    }

    if (trimmed.startsWith('> ')) {
      closeList()
      html.push(
        `<blockquote class="border-l-2 border-accent pl-3 my-2 text-ink-muted italic text-sm">${renderInline(trimmed.slice(2))}</blockquote>`
      )
      continue
    }

    const boldOnly = trimmed.match(/^\*\*(.+)\*\*$/)
    if (boldOnly) {
      closeList()
      html.push(
        `<h3 class="mt-3 mb-1 text-sm font-semibold text-ink">${escapeHtml(boldOnly[1])}</h3>`
      )
      continue
    }

    closeList()
    html.push(`<p class="text-sm text-ink leading-relaxed my-1.5">${renderInline(trimmed)}</p>`)
  }

  closeList()
  if (inCodeBlock) {
    html.push(
      `<pre data-language="${codeLanguage}" class="bg-surface-raised rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
    )
  }

  return html.join('\n')
}
