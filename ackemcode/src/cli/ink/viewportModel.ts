import type { HistoryItem } from '../app/historyTypes.js'
import {
  lineCountForHistoryItem,
  linesForHistoryItem,
  styledLinesForHistoryItem
} from '../app/historyDisplayLines.js'
import type { StyledMarkdownLine } from '../app/TerminalMarkdown.js'
import { PIXEL_ACKEM_LINE_COUNT } from '../app/logo.js'

export type ViewportEntry = {
  item: HistoryItem
  itemIndex: number
  skipTop: number
  visibleLines: number
}

/** 1-indexed terminal row of the first history viewport line (must match App.tsx chrome). */
export function historyContentOriginRow1(opts: {
  showLogo: boolean
  showEmptyCwd: boolean
  showUnseenHint: boolean
  showScrollHint: boolean
}): number {
  let rows = 0
  if (opts.showLogo) rows += PIXEL_ACKEM_LINE_COUNT
  else rows += 1
  if (opts.showEmptyCwd) rows += 1
  if (opts.showUnseenHint) rows += 1
  if (opts.showScrollHint) rows += 1
  return rows + 1
}

/** Visible viewport lines (for selection indices 0..n-1) and copy text. */
export function buildVisibleViewportStyledLines(
  view: ViewportEntry[],
  cols: number,
  leadBlankForYou: (index: number) => boolean
): StyledMarkdownLine[] {
  const lines: StyledMarkdownLine[] = []
  for (const entry of view) {
    const itemLines = styledLinesForHistoryItem(entry.item, cols)
    if (entry.item.kind === 'you' && leadBlankForYou(entry.itemIndex)) {
      if (entry.skipTop === 0) lines.push({ text: ' ', spans: [{ text: ' ' }] })
    }
    lines.push(...itemLines.slice(entry.skipTop, entry.skipTop + entry.visibleLines))
  }
  return lines
}

export function buildVisibleViewportLines(
  view: ViewportEntry[],
  cols: number,
  leadBlankForYou: (index: number) => boolean
): string[] {
  return buildVisibleViewportStyledLines(view, cols, leadBlankForYou).map((line) => line.text)
}

export { lineCountForHistoryItem, linesForHistoryItem }

export function pointerFromMouse(opts: {
  originRow1: number
  row1: number
  col1: number
  lineCount: number
  contentCols: number
}): { line: number; col: number } | null {
  if (opts.col1 > opts.contentCols) return null
  const rowOffset = Number(process.env.ACKEM_SEL_ROW_OFFSET ?? 0) || 0
  const line = opts.row1 - opts.originRow1 + rowOffset
  if (line < 0 || line >= opts.lineCount) return null
  return { line, col: Math.max(0, opts.col1 - 1) }
}
