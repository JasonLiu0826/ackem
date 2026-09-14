import React, { useRef } from 'react'
import { Box, Text } from 'ink'
import type { EffortLevel } from '../../shared/types.js'
import { l } from './language.js'
import { effortColor, lerpHex, theme } from './theme.js'

const LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'max']

function effortMeta(): Record<
  EffortLevel,
  { label: string; short: string; detail: string; ink: string }
> {
  return {
    low: {
      label: 'low',
      short: l('更快', 'Faster'),
      detail: l('少想一点，适合小改动。', 'Less reasoning for small changes.'),
      ink: theme.bg
    },
    medium: {
      label: 'medium',
      short: l('均衡', 'Balanced'),
      detail: l('日常开发的默认强度。', 'Balanced default for daily development.'),
      ink: theme.bg
    },
    high: {
      label: 'high',
      short: l('深入', 'Deeper'),
      detail: l('更认真推理，适合较难任务。', 'More reasoning for difficult tasks.'),
      ink: theme.fg
    },
    max: {
      label: 'max',
      short: l('最强', 'Maximum'),
      detail: l('最强推理，更慢且消耗更多 token。', 'Maximum reasoning; slower and uses more tokens.'),
      ink: theme.fg
    }
  }
}

const WAVE_DARK = '#35135F'
const WAVE_LIGHT = '#B87BFA'
const WAVE_STEPS = 18

type Cell = { ch: string; fg: string; bg: string; skip?: boolean }

function chWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0
  if (
    c >= 0x2e80 &&
    (c <= 0xa4cf || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60))
  ) {
    return 2
  }
  return 1
}

function textWidth(text: string): number {
  let n = 0
  for (const ch of text) n += chWidth(ch)
  return n
}

function makeGrid(w: number, h: number, bg: string): Cell[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: ' ', fg: theme.fg, bg }))
  )
}

function paint(grid: Cell[][], x: number, y: number, text: string, fg: string, bg?: string): void {
  const w = grid[0]?.length ?? 0
  if (y < 0 || y >= grid.length) return
  let cx = x
  for (const ch of text) {
    const dw = chWidth(ch)
    if (cx >= 0 && cx < w) {
      const prev = grid[y]![cx]!
      grid[y]![cx] = { ch, fg, bg: bg ?? prev.bg }
      if (dw === 2 && cx + 1 < w) {
        grid[y]![cx + 1] = { ch: '', fg, bg: bg ?? prev.bg, skip: true }
      }
    }
    cx += dw
  }
}

function easeOut(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return 1 - (1 - u) * (1 - u)
}

function rippleBg(
  x: number,
  y: number,
  cx: number,
  cy: number,
  elapsed: number,
  w: number,
  h: number
): string {
  // The source sits just left of MAX. Vertical distance is stretched so the
  // rings read as fine, slightly curved columns instead of large round blobs.
  const glowCx = cx - Math.min(7, Math.round(w * 0.055))
  const dx = x - glowCx
  const dy = (y - cy) * 2.7
  const distance = Math.hypot(dx, dy)
  const maxDistance = Math.max(
    Math.hypot(glowCx, cy * 2.7),
    Math.hypot(glowCx, (h - 1 - cy) * 2.7),
    Math.hypot(w - 1 - glowCx, cy * 2.7),
    Math.hypot(w - 1 - glowCx, (h - 1 - cy) * 2.7)
  )

  // The leading edge expands once from MAX until every corner is covered.
  const front = Math.max(2.5, easeOut(elapsed / 1.35) * (maxDistance + 2))
  if (distance > front) return theme.bg

  const normalized = Math.min(1, distance / maxDistance)
  const horizontal = Math.max(0, Math.min(1, (glowCx - x) / Math.max(1, glowCx)))

  // Right side stays deep; successive fine rings brighten as they travel left.
  const rings = 0.5 + 0.5 * Math.cos(distance * 0.52 - elapsed * 3.8)
  const leadingCrest = Math.exp(-((distance - front) ** 2) / 8)
  const core = Math.exp(-(distance * distance) / 150)
  let intensity =
    0.26 +
    horizontal * 0.25 +
    normalized * 0.08 +
    rings * 0.19 +
    leadingCrest * 0.15 -
    core * 0.12

  // More, smaller shades avoid the coarse seven-band look while retaining
  // crisp character-sized pixels.
  intensity = Math.max(0.08, Math.min(0.88, intensity))
  intensity = Math.round(intensity * (WAVE_STEPS - 1)) / (WAVE_STEPS - 1)
  return lerpHex(WAVE_DARK, WAVE_LIGHT, intensity)
}

function mergeRow(cells: Cell[]): Array<{ text: string; fg: string; bg: string }> {
  const runs: Array<{ text: string; fg: string; bg: string }> = []
  for (const c of cells) {
    if (c.skip) continue
    const last = runs[runs.length - 1]
    if (last && last.fg === c.fg && last.bg === c.bg) last.text += c.ch
    else runs.push({ text: c.ch, fg: c.fg, bg: c.bg })
  }
  return runs
}

export function EffortBar(props: { index: number; pulse: number }): React.ReactElement {
  const metaByLevel = effortMeta()
  const w = Math.max(48, (process.stdout.columns || 80) - 2)
  const h = 8
  const focus = LEVELS[props.index] ?? 'medium'
  const focusMax = focus === 'max'
  const start = useRef<{ on: boolean; pulse: number }>({ on: false, pulse: 0 })
  if (focusMax && !start.current.on) start.current = { on: true, pulse: props.pulse }
  if (!focusMax && start.current.on) start.current = { on: false, pulse: 0 }

  const elapsed = focusMax ? Math.max(0, (props.pulse - start.current.pulse) * 0.05) : 0
  const muted = focusMax ? theme.fg : theme.fgMuted
  const accentInk = (on: boolean, level: EffortLevel) =>
    on && !focusMax ? effortColor(level) : muted

  const left = 3
  const right = w - 4
  const span = right - left
  const centers = LEVELS.map((_, i) => left + Math.round((span * i) / (LEVELS.length - 1)))
  const cx = centers[props.index] ?? left
  const cy = 3

  const grid = makeGrid(w, h, theme.bg)
  if (focusMax) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        grid[y]![x]!.bg = rippleBg(x, y, cx, cy, elapsed, w, h)
      }
    }
  }

  paint(grid, 0, 0, l('思考强度', 'effort'), theme.fg)
  paint(grid, left, 1, l('更快', 'Faster'), muted)
  paint(grid, w - 8, 1, l('更聪明', 'Smarter'), muted)

  const track = '─'.repeat(Math.max(1, right - left + 1))
  paint(grid, left, 2, track, theme.fg)
  paint(grid, cx, 2, '▲', theme.fg)

  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i]!
    const meta = metaByLevel[level]
    const x = centers[i]! - Math.floor(textWidth(meta.label) / 2)
    const on = i === props.index
    if (on) {
      paint(grid, x - 1, 3, ` ${meta.label} `, meta.ink, effortColor(level))
    } else {
      paint(grid, x, 3, meta.label, muted)
    }
    const sx = centers[i]! - Math.floor(textWidth(meta.short) / 2)
    paint(grid, sx, 4, meta.short, accentInk(on, level))
  }

  paint(grid, 0, 6, metaByLevel[focus].detail, muted)
  paint(grid, 0, 7, l('←/→ 选择 · Enter 确认 · Esc 取消', '←/→ select · Enter confirm · Esc cancel'), muted)

  return (
    <Box flexDirection="column" flexShrink={0}>
      {grid.map((row, y) => (
        <Text key={y}>
          {mergeRow(row).map((run, i) => (
            <Text key={i} color={run.fg} backgroundColor={run.bg}>
              {run.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}
