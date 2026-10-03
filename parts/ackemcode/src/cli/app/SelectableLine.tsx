import React from 'react'
import { Text } from 'ink'
import {
  lineSelectionSpan,
  type SelectionState
} from '../ink/selection.js'
import { splitAtDisplayWidth, stringDisplayWidth } from './textWidth.js'
import { theme } from './theme.js'
import type { MarkdownSpan } from './TerminalMarkdown.js'

function toneColor(tone?: MarkdownSpan['tone'], fallback = theme.fg): string {
  if (tone === 'accent') return theme.accent
  if (tone === 'emphasis') return theme.emphasis
  if (tone === 'cyan') return theme.cyan
  if (tone === 'fgMuted') return theme.fgMuted
  if (tone === 'fgDim') return theme.fgDim
  if (tone === 'fg') return theme.fg
  return fallback
}

function splitForSelection(
  text: string,
  startCol: number,
  endCol: number
): { before: string; mid: string; after: string } {
  const w = stringDisplayWidth(text)
  const end = endCol === Infinity ? w : Math.min(w, endCol + 1)
  const a = Math.max(0, Math.min(startCol, w))
  const b = Math.max(a, end)
  const before = splitAtDisplayWidth(text, a).before
  const rest = text.slice(before.length)
  const midWidth = b - a
  const mid =
    midWidth <= 0
      ? ''
      : splitAtDisplayWidth(rest, midWidth).before
  const after = rest.slice(mid.length)
  return { before, mid, after }
}

export function SelectableLine(props: {
  text: string
  lineIndex: number
  selection: SelectionState | null
  color?: string
  backgroundColor?: string
  bold?: boolean
  spans?: MarkdownSpan[]
}): React.ReactElement {
  const fallback = props.color ?? theme.fg
  const line = props.text || ' '
  const spans =
    props.spans && props.spans.length ? props.spans : [{ text: line, bold: props.bold }]
  const sel =
    props.selection && props.selection.anchor
      ? lineSelectionSpan(props.lineIndex, props.selection)
      : null

  if (!sel) {
    return (
      <Text backgroundColor={props.backgroundColor}>
        {spans.map((piece, i) => (
          <Text
            key={i}
            color={toneColor(piece.tone, fallback)}
            backgroundColor={props.backgroundColor}
            bold={piece.bold ?? props.bold}
          >
            {piece.text}
          </Text>
        ))}
      </Text>
    )
  }

  const nodes: React.ReactNode[] = []
  let col = 0
  for (let i = 0; i < spans.length; i++) {
    const piece = spans[i]!
    const { before, mid, after } = splitForSelection(
      piece.text,
      sel.startCol - col,
      sel.endCol === Infinity ? Infinity : sel.endCol - col
    )
    const color = toneColor(piece.tone, fallback)
    const bold = piece.bold ?? props.bold
    if (before) {
      nodes.push(
        <Text key={`${i}-b`} color={color} backgroundColor={props.backgroundColor} bold={bold}>
          {before}
        </Text>
      )
    }
    if (mid) {
      nodes.push(
        <Text key={`${i}-m`} color={color} backgroundColor={theme.selectionBg} bold={bold}>
          {mid}
        </Text>
      )
    }
    if (after) {
      nodes.push(
        <Text key={`${i}-a`} color={color} backgroundColor={props.backgroundColor} bold={bold}>
          {after}
        </Text>
      )
    }
    col += stringDisplayWidth(piece.text)
  }

  return (
    <Text backgroundColor={props.backgroundColor}>
      {nodes.length ? nodes : ' '}
    </Text>
  )
}
