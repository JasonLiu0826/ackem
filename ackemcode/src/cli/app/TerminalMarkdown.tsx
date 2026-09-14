import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { theme } from './theme.js'
import {
  splitAtDisplayWidth,
  stringDisplayWidth
} from './textWidth.js'

export type MarkdownBlock =
  | { kind: 'line'; text: string; index: number }
  | { kind: 'table'; headers: string[]; rows: string[][]; index: number }

const PIPE = /[|｜]/

function normalizePipes(line: string): string {
  return line.replace(/｜/g, '|')
}

function tableCells(line: string): string[] {
  let value = normalizePipes(line).trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replaceAll('\\|', '|'))
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line)
  return (
    cells.length > 1 &&
    cells.every((cell) => /^:?[-–—]{2,}:?$/.test(cell.replace(/\s/g, '')))
  )
}

function looksLikeTableRow(line: string): boolean {
  if (!PIPE.test(line)) return false
  const cells = tableCells(line)
  return cells.length >= 2 && cells.some((cell) => cell.length > 0) && !isTableSeparator(line)
}

/** GFM tables, plus consecutive pipe-rows with no --- separator (common model output). */
export function markdownBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let inCode = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*```/.test(line)) {
      inCode = !inCode
      blocks.push({ kind: 'line', text: line, index: i })
      continue
    }

    if (!inCode && looksLikeTableRow(line)) {
      const next = lines[i + 1]
      const startCells = tableCells(line)
      const hasSep = next !== undefined && isTableSeparator(next)
      const nextIsRow =
        next !== undefined &&
        looksLikeTableRow(next) &&
        tableCells(next).length === startCells.length
      if (hasSep || nextIsRow) {
        const headers = startCells
        const rows: string[][] = []
        let end = i + 1
        if (hasSep) end += 1
        while (end < lines.length && looksLikeTableRow(lines[end]!)) {
          const cells = tableCells(lines[end]!)
          if (Math.abs(cells.length - headers.length) > 1) break
          rows.push(cells)
          end++
        }
        if (hasSep || rows.length >= 1) {
          blocks.push({ kind: 'table', headers, rows, index: i })
          i = end - 1
          continue
        }
      }
    }

    blocks.push({ kind: 'line', text: line, index: i })
  }

  return blocks
}

export function plainInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

/** Soft-wrap a cell to `width` columns. Never ellipsize — that overflowed CJK borders. */
function wrapCell(text: string, width: number): string[] {
  const plain = plainInline(text)
  const w = Math.max(1, width)
  if (!plain) return [' '.repeat(w)]
  const lines: string[] = []
  let rest = plain
  while (rest) {
    let { before, after } = splitAtDisplayWidth(rest, w)
    if (!before) {
      const ch = [...rest][0] ?? ''
      before = ch
      after = rest.slice(ch.length)
    }
    lines.push(before + ' '.repeat(Math.max(0, w - stringDisplayWidth(before))))
    rest = after
  }
  return lines
}

function tableRowLines(row: string[], widths: number[]): string[] {
  const cells = widths.map((width, i) => wrapCell(row[i] ?? '', width))
  const height = Math.max(1, ...cells.map((cell) => cell.length))
  const lines: string[] = []
  for (let y = 0; y < height; y++) {
    lines.push(
      `  │ ${widths.map((width, i) => cells[i]![y] ?? ' '.repeat(width)).join(' │ ')} │`
    )
  }
  return lines
}

export function tableColumnWidths(
  headers: string[],
  rows: string[][],
  cols: number
): number[] {
  const columnCount = Math.max(headers.length, ...rows.map((r) => r.length), 1)
  const allRows = [headers, ...rows]
  const widths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(3, ...allRows.map((row) => stringDisplayWidth(plainInline(row[column] ?? ''))))
  )
  const tableWidth = () => widths.reduce((sum, width) => sum + width, 0) + columnCount * 3 + 1
  const available = Math.max(16, cols - 4)
  while (tableWidth() > available) {
    let widest = -1
    for (let i = 0; i < widths.length; i++) {
      if (widths[i]! > 3 && (widest < 0 || widths[i]! > widths[widest]!)) widest = i
    }
    if (widest < 0) break
    widths[widest]!--
  }
  return widths
}

export function formatTableLines(
  headers: string[],
  rows: string[][],
  cols: number
): string[] {
  const widths = tableColumnWidths(headers, rows, cols)
  const border = (left: string, mid: string, right: string) =>
    `  ${left}${widths.map((w) => '─'.repeat(w + 2)).join(mid)}${right}`
  const out = [border('┌', '┬', '┐'), ...tableRowLines(headers, widths)]
  for (const row of rows) {
    out.push(border('├', '┼', '┤'))
    out.push(...tableRowLines(row, widths))
  }
  out.push(border('└', '┴', '┘'))
  return out
}

/** Extra lines vs raw markdown: top + one rule per body row + bottom, minus the GFM --- row. */
export function terminalMarkdownExtraLines(text: string): number {
  const blocks = markdownBlocks(text.replace(/\r\n/g, '\n').split('\n'))
  return blocks.reduce((sum, block) => {
    if (block.kind !== 'table') return sum
    return sum + 2 + block.rows.length
  }, 0)
}

export function terminalMarkdownLineCount(text: string, cols: number): number {
  return Math.max(1, terminalMarkdownFlatLines(text, cols).length)
}

export type MarkdownTone = 'fg' | 'accent' | 'emphasis' | 'cyan' | 'fgMuted' | 'fgDim'

export type MarkdownSpan = {
  text: string
  tone?: MarkdownTone
  bold?: boolean
  href?: string
}

export type StyledMarkdownLine = {
  text: string
  spans: MarkdownSpan[]
  /** Full-width user-message bar (every wrapped line). */
  bar?: 'user'
}

function lineFromSpans(spans: MarkdownSpan[]): StyledMarkdownLine {
  const list = spans.filter((span) => span.text.length > 0)
  const ready = list.length ? list : [{ text: ' ' }]
  return { text: ready.map((span) => span.text).join(''), spans: ready }
}

function inlineSpans(text: string): MarkdownSpan[] {
  const spans: MarkdownSpan[] = []
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) {
      spans.push({ text: text.slice(cursor, match.index), tone: 'fg' })
    }
    const token = match[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      spans.push({ text: token.slice(2, -2), tone: 'emphasis', bold: true })
    } else if (token.startsWith('`')) {
      spans.push({ text: token.slice(1, -1), tone: 'cyan' })
    } else {
      const href = token.match(/\((https?:\/\/[^)]+|file:[^)]+)\)/i)?.[1]
      spans.push({
        text: token.match(/^\[([^\]]+)\]/)?.[1] ?? token,
        tone: 'emphasis',
        href
      })
    }
    cursor = match.index + token.length
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor), tone: 'fg' })
  return decorateBareUrls(spans.length ? spans : [{ text: ' ', tone: 'fg' }])
}

function decorateBareUrls(spans: MarkdownSpan[]): MarkdownSpan[] {
  const out: MarkdownSpan[] = []
  const pattern = /https?:\/\/[^\s<>"'`）】]+/gi
  for (const span of spans) {
    if (span.href) {
      out.push(span)
      continue
    }
    const text = span.text
    pattern.lastIndex = 0
    let cursor = 0
    let match: RegExpExecArray | null
    let found = false
    while ((match = pattern.exec(text))) {
      found = true
      if (match.index > cursor) {
        out.push({ ...span, text: text.slice(cursor, match.index) })
      }
      out.push({ ...span, text: match[0], tone: 'emphasis', href: match[0] })
      cursor = match.index + match[0].length
    }
    if (!found) out.push(span)
    else if (cursor < text.length) out.push({ ...span, text: text.slice(cursor) })
  }
  return out
}

function wrapSpans(spans: MarkdownSpan[], width: number): MarkdownSpan[][] {
  const rows: MarkdownSpan[][] = []
  let row: MarkdownSpan[] = []
  let rowWidth = 0

  const flush = () => {
    rows.push(row.length ? row : [{ text: ' ' }])
    row = []
    rowWidth = 0
  }

  for (const span of spans) {
    let remaining = span.text
    while (remaining) {
      const room = width - rowWidth
      if (room <= 0) {
        flush()
        continue
      }
      if (stringDisplayWidth(remaining) <= room) {
        row.push({ ...span, text: remaining })
        rowWidth += stringDisplayWidth(remaining)
        break
      }
      const chunk = splitAtDisplayWidth(remaining, room).before
      if (!chunk) {
        if (rowWidth > 0) {
          flush()
          continue
        }
        const ch = [...remaining][0] ?? ''
        row.push({ ...span, text: ch })
        remaining = remaining.slice(ch.length)
        flush()
        continue
      }
      row.push({ ...span, text: chunk })
      remaining = remaining.slice(chunk.length)
      flush()
    }
  }
  if (row.length) rows.push(row)
  return rows.length ? rows : [[{ text: ' ' }]]
}

function formatTableStyledLines(
  headers: string[],
  rows: string[][],
  cols: number
): StyledMarkdownLine[] {
  const widths = tableColumnWidths(headers, rows, cols)
  const border = (left: string, mid: string, right: string): StyledMarkdownLine =>
    lineFromSpans([
      {
        text: `  ${left}${widths.map((w) => '─'.repeat(w + 2)).join(mid)}${right}`,
        tone: 'accent'
      }
    ])
  const rowLines = (row: string[], header = false): StyledMarkdownLine[] => {
    const cells = widths.map((width, column) => wrapCell(row[column] ?? '', width))
    const height = Math.max(1, ...cells.map((cell) => cell.length))
    const lines: StyledMarkdownLine[] = []
    for (let y = 0; y < height; y++) {
      const spans: MarkdownSpan[] = [{ text: '  │ ', tone: 'accent' }]
      for (let column = 0; column < widths.length; column++) {
        spans.push({
          text: cells[column]![y] ?? ' '.repeat(widths[column]!),
          tone: header ? 'emphasis' : 'fg',
          bold: header || column === 0
        })
        spans.push({ text: ' │ ', tone: 'accent' })
      }
      lines.push(lineFromSpans(spans))
    }
    return lines
  }
  const out = [border('┌', '┬', '┐'), ...rowLines(headers, true)]
  for (const row of rows) {
    out.push(border('├', '┼', '┤'))
    out.push(...rowLines(row))
  }
  out.push(border('└', '┴', '┘'))
  return out
}

function styledSourceLine(line: string, width: number): StyledMarkdownLine[] {
  const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)
  if (heading) {
    return wrapSpans([{ text: `  ${heading[1]}`, tone: 'emphasis', bold: true }], width).map(
      lineFromSpans
    )
  }
  const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/)
  if (bullet) {
    return wrapSpans(
      [
        { text: `  ${bullet[1]}`, tone: 'fg' },
        { text: '• ', tone: 'accent' },
        ...inlineSpans(bullet[2]!)
      ],
      width
    ).map(lineFromSpans)
  }
  const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
  if (numbered) {
    return wrapSpans(
      [
        { text: `  ${numbered[1]}`, tone: 'fg' },
        { text: `${numbered[2]}. `, tone: 'emphasis', bold: true },
        ...inlineSpans(numbered[3]!)
      ],
      width
    ).map(lineFromSpans)
  }
  const quote = line.match(/^\s*>\s?(.*)$/)
  if (quote) {
    return wrapSpans(
      [{ text: '  │ ', tone: 'accent' }, ...inlineSpans(quote[1] ?? '')],
      width
    ).map(lineFromSpans)
  }
  if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
    return [lineFromSpans([{ text: `  ${'─'.repeat(28)}`, tone: 'accent' }])]
  }
  return wrapSpans([{ text: '  ', tone: 'fg' }, ...inlineSpans(line)], width).map(lineFromSpans)
}

/** Colored lines for the history viewport (tones resolved at paint time). */
export function terminalMarkdownStyledLines(
  text: string,
  cols: number
): StyledMarkdownLine[] {
  const width = Math.max(8, cols - 2)
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks = markdownBlocks(lines)
  const out: StyledMarkdownLine[] = []
  let inCode = false

  for (const block of blocks) {
    if (block.kind === 'table') {
      out.push(...formatTableStyledLines(block.headers, block.rows, cols))
      continue
    }
    const line = block.text
    const fence = line.match(/^\s*```(.*)$/)
    if (fence) {
      inCode = !inCode
      const language = fence[1]?.trim()
      out.push(
        lineFromSpans([
          {
            text: inCode ? `  ┌─${language ? ` ${language}` : ''}` : '  └─',
            tone: 'accent'
          }
        ])
      )
      continue
    }
    if (inCode) {
      out.push(
        lineFromSpans([
          { text: '  │ ', tone: 'accent' },
          { text: line || ' ', tone: 'fg' }
        ])
      )
      continue
    }
    if (!line.trim()) {
      out.push(lineFromSpans([{ text: ' ' }]))
      continue
    }
    out.push(...styledSourceLine(line, width))
  }
  return out.length ? out : [lineFromSpans([{ text: ' ' }])]
}

/** Plain strings as shown in the terminal (for mouse selection / copy). */
export function terminalMarkdownFlatLines(text: string, cols: number): string[] {
  return terminalMarkdownStyledLines(text, cols).map((line) => line.text)
}

function TerminalTable(props: {
  headers: string[]
  rows: string[][]
  cols: number
}): React.ReactElement {
  const widths = tableColumnWidths(props.headers, props.rows, props.cols)
  const border = (left: string, middle: string, right: string) =>
    `  ${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`
  const renderRow = (row: string[], rowIndex: number, header = false) => {
    const cells = widths.map((width, column) => wrapCell(row[column] ?? '', width))
    const height = Math.max(1, ...cells.map((cell) => cell.length))
    return Array.from({ length: height }, (_, y) => (
      <Text key={`row-${rowIndex}-${y}`}>
        <Text color={theme.accent}>{'  │ '}</Text>
        {widths.map((width, column) => (
          <React.Fragment key={column}>
            <Text bold={header || column === 0} color={header ? theme.emphasis : theme.fg}>
              {cells[column]![y] ?? ' '.repeat(width)}
            </Text>
            <Text color={theme.accent}>{' │ '}</Text>
          </React.Fragment>
        ))}
      </Text>
    ))
  }

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color={theme.accent}>{border('┌', '┬', '┐')}</Text>
      {renderRow(props.headers, -1, true)}
      {props.rows.map((row, index) => (
        <React.Fragment key={`body-${index}`}>
          <Text color={theme.accent}>{border('├', '┼', '┤')}</Text>
          {renderRow(row, index)}
        </React.Fragment>
      ))}
      <Text color={theme.accent}>{border('└', '┴', '┘')}</Text>
    </Box>
  )
}

/** Headings, bold, links — brighter than table/chrome accent. */
function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <Text key={match.index} bold color={theme.emphasis}>
          {token.slice(2, -2)}
        </Text>
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <Text key={match.index} color={theme.cyan}>
          {token.slice(1, -1)}
        </Text>
      )
    } else {
      const label = token.match(/^\[([^\]]+)\]/)?.[1] ?? token
      nodes.push(
        <Text key={match.index} color={theme.emphasis} underline>
          {label}
        </Text>
      )
    }
    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export function TerminalMarkdown(props: { text: string }): React.ReactElement {
  const { stdout } = useStdout()
  const cols = stdout.columns || 80
  const lines = props.text.replace(/\r\n/g, '\n').split('\n')
  const blocks = markdownBlocks(lines)
  let inCode = false

  return (
    <Box flexDirection="column" flexShrink={0}>
      {blocks.map((block) => {
        if (block.kind === 'table') {
          return (
            <TerminalTable
              key={`table-${block.index}`}
              headers={block.headers}
              rows={block.rows}
              cols={cols}
            />
          )
        }

        const line = block.text
        const index = block.index
        const fence = line.match(/^\s*```(.*)$/)
        if (fence) {
          const opening = !inCode
          inCode = opening
          const language = fence[1]?.trim()
          return (
            <Text key={index} color={theme.accent}>
              {opening ? `  ┌─${language ? ` ${language}` : ''}` : '  └─'}
            </Text>
          )
        }

        if (inCode) {
          return (
            <Text key={index} color={theme.fg}>
              <Text color={theme.accent}>{'  │ '}</Text>
              {line || ' '}
            </Text>
          )
        }

        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)
        if (heading) {
          return (
            <Text key={index} bold color={theme.emphasis}>
              {`  ${heading[1]}`}
            </Text>
          )
        }

        const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/)
        if (bullet) {
          return (
            <Text key={index} color={theme.fg}>
              {`  ${bullet[1]}`}
              <Text color={theme.accent}>• </Text>
              {inline(bullet[2]!)}
            </Text>
          )
        }

        const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
        if (numbered) {
          return (
            <Text key={index} color={theme.fg}>
              {`  ${numbered[1]}`}
              <Text bold color={theme.emphasis}>
                {`${numbered[2]}. `}
              </Text>
              {inline(numbered[3]!)}
            </Text>
          )
        }

        const quote = line.match(/^\s*>\s?(.*)$/)
        if (quote) {
          return (
            <Text key={index} color={theme.fgMuted}>
              <Text color={theme.accent}>{'  │ '}</Text>
              {inline(quote[1]!)}
            </Text>
          )
        }

        if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
          return (
            <Text key={index} color={theme.accent}>
              {`  ${'─'.repeat(28)}`}
            </Text>
          )
        }

        if (!line.trim()) {
          return <Text key={index}>{' '}</Text>
        }

        return (
          <Text key={index} color={theme.fg}>
            {'  '}
            {inline(line)}
          </Text>
        )
      })}
    </Box>
  )
}
