/** SGR mouse (1000+1002+1006): wheel + drag selection (Claude Code dec.ts). */
export const ENABLE_MOUSE_TRACKING = '\x1b[?1000h\x1b[?1002h\x1b[?1006h'
/** xterm 1007: wheel → arrow keys — use ACKEM_ALTERNATE_SCROLL=1 only if needed. */
export const ENABLE_ALTERNATE_SCROLL = '\x1b[?1007h'
export const DISABLE_MOUSE_TRACKING = '\x1b[?1007l\x1b[?1002l\x1b[?1006l\x1b[?1000l'

/** CC-style escape hatch: native terminal copy, keyboard scroll only. */
export function chatMouseEnableSequence(): string {
  if (process.env.ACKEM_DISABLE_MOUSE === '1') return ''
  if (process.env.ACKEM_ALTERNATE_SCROLL === '1') return ENABLE_ALTERNATE_SCROLL
  return ENABLE_MOUSE_TRACKING
}

export type TerminalMouseEvent =
  | { kind: 'wheel'; direction: 'up' | 'down'; row: number; col: number }
  | { kind: 'left-press'; row: number; col: number }
  | { kind: 'left-drag'; row: number; col: number }
  | { kind: 'left-release'; row: number; col: number }
  | { kind: 'other' }

/** Parse SGR mouse input after Ink has stripped its leading Escape byte. */
export function parseTerminalMouse(input: string): TerminalMouseEvent | null {
  const normalized = input.startsWith('\x1b') ? input.slice(1) : input
  const match = normalized.match(/^\[<(\d+);(\d+);(\d+)([Mm])/)
  if (!match) return null

  const button = Number(match[1])
  // SGR 1006: CSI < Cb ; Cx ; Cy M — column then row (same as CC ink/parse-keypress.ts)
  const col = Number(match[2])
  const row = Number(match[3])
  const isPress = match[4] === 'M'
  if ((button & 0x40) !== 0) {
    return { kind: 'wheel', direction: (button & 1) === 0 ? 'up' : 'down', row, col }
  }
  const motion = (button & 0x20) !== 0
  const btn = button & 0x03
  if (isPress && motion && btn === 0) {
    return { kind: 'left-drag', row, col }
  }
  if (isPress && !motion && btn === 0) {
    return { kind: 'left-press', row, col }
  }
  if (!isPress && btn === 0) {
    return { kind: 'left-release', row, col }
  }
  return { kind: 'other' }
}
