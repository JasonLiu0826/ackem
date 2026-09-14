import React from 'react'
import { Text } from 'ink'
import { lerpHex, theme } from './theme.js'

export const PIXEL_ACKEM_LINE_COUNT = 5

export const PIXEL_ACKEMCODE = [
  ' ██  ███ █  █ ███ █   █ ███ ████ ███  ███',
  '█  █ █   █ █  █   ██ ██ █   █  █ █  █ █',
  '████ █   ██   ███ █ █ █ █   █  █ █  █ ███',
  '█  █ █   █ █  █   █   █ █   █  █ █  █ █',
  '█  █ ███ █  █ ███ █   █ ███ ████ ███  ███'
]

/** ACKEM stays default fg; CODE = yellow / green / blue / purple. */
const CODE_SLICES = [
  { start: 23, end: 28, color: theme.brandCodeC },
  { start: 28, end: 33, color: theme.brandCodeO },
  { start: 33, end: 38, color: theme.brandCodeD },
  { start: 38, end: 99, color: theme.brandCodeE }
] as const

export function AckemCodeTitle(props: {
  suffix?: React.ReactNode
}): React.ReactElement {
  return (
    <Text>
      Ackem
      <Text color={theme.brandCodeC}>C</Text>
      <Text color={theme.brandCodeO}>o</Text>
      <Text color={theme.brandCodeD}>d</Text>
      <Text color={theme.brandCodeE}>e</Text>
      {props.suffix}
    </Text>
  )
}

export function PixelAckemLogo(): React.ReactElement {
  return (
    <>
      {PIXEL_ACKEMCODE.map((line) => (
        <Text key={line} color={theme.fg}>
          {line.slice(0, 23)}
          {CODE_SLICES.map((s) => (
            <Text key={s.start} color={s.color}>
              {line.slice(s.start, s.end)}
            </Text>
          ))}
        </Text>
      ))}
    </>
  )
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function formatThoughtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}m` : `${m}m${s}s`
}

export const PULSE_FRAMES = ['·', '▁', '▃', '▅', '▇', '█'] as const

/** Low → high. Each bar walks the full stack so the bounce is visible. */
const BAR_LEVELS = ['·', '▁', '▃', '▅', '▇', '█'] as const
const BAR_PERIOD = 10

/** Three bars, 120° apart, each oscillating top ↔ bottom. */
export function pulseBars(pulse: number): string {
  const last = BAR_LEVELS.length - 1
  return [0, 1, 2]
    .map((i) => {
      const phase = (pulse / BAR_PERIOD) * Math.PI * 2 + (i * 2 * Math.PI) / 3
      const idx = Math.round(((Math.sin(phase) + 1) / 2) * last)
      return BAR_LEVELS[idx]!
    })
    .join('')
}

/** Green → light blue → blue → deep blue → purple. Darker as thinking runs longer. */
const PULSE_BAR_STOPS = ['#52D070', '#7ED4FF', '#3D8BFF', '#163A8C', '#4A148C'] as const
const PULSE_BAR_SPAN_MS = 80_000

export function pulseBarColor(startedAt: number): string {
  const t = Math.max(0, Math.min(1, (Date.now() - startedAt) / PULSE_BAR_SPAN_MS))
  const n = PULSE_BAR_STOPS.length - 1
  const x = t * n
  const i = Math.min(n - 1, Math.floor(x))
  return lerpHex(PULSE_BAR_STOPS[i]!, PULSE_BAR_STOPS[i + 1]!, x - i)
}

export function PulseBarsGlyph(props: {
  pulse: number
  startedAt: number
}): React.ReactElement {
  return <Text color={pulseBarColor(props.startedAt)}>{pulseBars(props.pulse)}</Text>
}
