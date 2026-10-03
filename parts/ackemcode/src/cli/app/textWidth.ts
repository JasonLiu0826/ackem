import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

/** Same width function Ink / wrap-ansi use (CJK, emoji, fullwidth). */
export function stringDisplayWidth(text: string): number {
  return stringWidth(text)
}

export const PROMPT_PREFIX = '❯ '

/** Last terminal column wraps by itself — match the ─── divider (`cols - 1`). */
export function promptWrapWidth(cols: number): number {
  return Math.max(8, cols - 1)
}

/** Pad with spaces so a line fills `width` display columns (Ink background bars). */
export function padToDisplayWidth(text: string, width: number): string {
  const w = stringDisplayWidth(text)
  if (w >= width) return text
  return text + ' '.repeat(width - w)
}

const WRAP_OPTS = { hard: true, trim: false } as const

/** Ink Text wrap="wrap" is wrap-ansi hard+trim:false. Same split. */
export function wrapPromptLines(text: string, cols: number): string[] {
  const width = promptWrapWidth(cols)
  if (!text) return ['']
  const lines = wrapAnsi(text, width, WRAP_OPTS).split('\n')
  return lines.length ? lines : ['']
}

export function inputUnits(text: string): string[] {
  return [...text]
}

export function clampCaret(text: string, caret: number): number {
  return Math.max(0, Math.min(inputUnits(text).length, caret))
}

export function caretToWrap(
  prefix: string,
  input: string,
  caret: number,
  cols: number
): {
  x: number
  line: number
  lines: number
} {
  const width = promptWrapWidth(cols)
  const units = inputUnits(input)
  const c = clampCaret(input, caret)
  const before = prefix + units.slice(0, c).join('')
  const beforeLines = wrapPromptLines(before, cols)
  const all = wrapPromptLines(prefix + input, cols)
  let line = beforeLines.length - 1
  let x = stringWidth(beforeLines[line] ?? '')
  // wrap-ansi does not add a trailing blank line when the last line is full.
  if (x >= width) {
    line += 1
    x = 0
  }
  return { x, line, lines: Math.max(all.length, line + 1) }
}

export function caretFromWrapPos(
  prefix: string,
  input: string,
  cols: number,
  line: number,
  column: number
): number {
  const units = inputUnits(input)
  let best = 0
  let bestDx = Infinity
  let seen = false
  for (let i = 0; i <= units.length; i++) {
    const pos = caretToWrap(prefix, input, i, cols)
    if (pos.line !== line) {
      if (seen) break
      continue
    }
    seen = true
    const dx = Math.abs(pos.x - column)
    if (dx < bestDx) {
      best = i
      bestDx = dx
    }
  }
  return best
}

/** Move caret one visual wrap line. Returns null if it would leave the input. */
/** Split at display column (for inline prompt cursor). */
export function splitAtDisplayWidth(
  text: string,
  column: number
): { before: string; after: string } {
  if (column <= 0) return { before: '', after: text }
  let w = 0
  let i = 0
  const units = inputUnits(text)
  for (const ch of units) {
    const cw = stringDisplayWidth(ch)
    if (w + cw > column) break
    w += cw
    i += ch.length
  }
  return { before: text.slice(0, i), after: text.slice(i) }
}

/** Grapheme at display column — for inverse caret overlay (CC-style, no layout shift). */
export function charAtDisplayColumn(
  text: string,
  column: number
): { before: string; cursorChar: string; after: string } {
  const { before, after } = splitAtDisplayWidth(text, column)
  if (!after) return { before, cursorChar: ' ', after: '' }
  const units = inputUnits(after)
  const cursorChar = units[0] ?? ' '
  return { before, cursorChar, after: after.slice(cursorChar.length) }
}

export function moveCaretWrapLine(
  prefix: string,
  input: string,
  caret: number,
  cols: number,
  dir: -1 | 1
): number | null {
  const pos = caretToWrap(prefix, input, caret, cols)
  const nextLine = pos.line + dir
  if (nextLine < 0 || nextLine >= pos.lines) return null
  return caretFromWrapPos(prefix, input, cols, nextLine, pos.x)
}
