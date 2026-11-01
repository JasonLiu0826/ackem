/**
 * Text selection (Claude Code ink/selection.ts — line/col model, no screen buffer).
 * Works with a flat viewport line list built each render.
 */

import { splitAtDisplayWidth, stringDisplayWidth } from '../app/textWidth.js'

export type Point = { line: number; col: number }

export type SelectionState = {
  anchor: Point | null
  focus: Point | null
  isDragging: boolean
}

export function createSelectionState(): SelectionState {
  return { anchor: null, focus: null, isDragging: false }
}

export function startSelection(s: SelectionState, line: number, col: number): void {
  s.anchor = { line, col: Math.max(0, col) }
  s.focus = { line, col: Math.max(0, col) }
  s.isDragging = true
}

export function updateSelection(s: SelectionState, line: number, col: number): void {
  if (!s.isDragging) return
  s.focus = { line, col: Math.max(0, col) }
}

export function endSelection(s: SelectionState): void {
  s.isDragging = false
}

export function clearSelection(s: SelectionState): void {
  s.anchor = null
  s.focus = null
  s.isDragging = false
}

export function hasSelection(s: SelectionState): boolean {
  return s.anchor !== null && s.focus !== null
}

export function normalizeSelection(
  s: SelectionState
): { start: Point; end: Point } | null {
  if (!s.anchor || !s.focus) return null
  const a = s.anchor
  const b = s.focus
  if (a.line < b.line || (a.line === b.line && a.col <= b.col)) {
    return { start: a, end: b }
  }
  return { start: b, end: a }
}

function sliceLineRange(text: string, startCol: number, endCol: number): string {
  const w = stringDisplayWidth(text)
  const a = Math.max(0, Math.min(startCol, w))
  const b = Math.max(a, Math.min(endCol, w))
  if (a === 0 && b >= w) return text
  const left = splitAtDisplayWidth(text, a).before
  const rightPart = text.slice(left.length)
  const mid = splitAtDisplayWidth(rightPart, b - a).before
  return left + mid
}

export function getSelectedText(lines: string[], s: SelectionState): string {
  const norm = normalizeSelection(s)
  if (!norm) return ''
  const { start, end } = norm
  const parts: string[] = []
  for (let i = start.line; i <= end.line && i < lines.length; i++) {
    const text = lines[i] ?? ''
    if (start.line === end.line) {
      parts.push(sliceLineRange(text, start.col, end.col + 1))
    } else if (i === start.line) {
      parts.push(sliceLineRange(text, start.col, stringDisplayWidth(text)))
    } else if (i === end.line) {
      parts.push(sliceLineRange(text, 0, end.col + 1))
    } else {
      parts.push(text)
    }
  }
  return parts.join('\n').replace(/\n+$/, '')
}

export function lineSelectionSpan(
  lineIndex: number,
  s: SelectionState
): { startCol: number; endCol: number } | null {
  const norm = normalizeSelection(s)
  if (!norm) return null
  const { start, end } = norm
  if (lineIndex < start.line || lineIndex > end.line) return null
  if (start.line === end.line && lineIndex === start.line) {
    return { startCol: start.col, endCol: end.col }
  }
  if (lineIndex === start.line) return { startCol: start.col, endCol: Infinity }
  if (lineIndex === end.line) return { startCol: 0, endCol: end.col }
  return { startCol: 0, endCol: Infinity }
}
