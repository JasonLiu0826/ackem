/** CLI §15 tokens — re-export active theme + helpers. */
export {
  applyTheme,
  currentThemeId,
  isThemeId,
  normalizeThemeId,
  theme,
  THEME_IDS,
  THEME_LABELS,
  type ThemeId,
  type ThemeTokens
} from './themes.js'

import { theme } from './themes.js'

export type ThemeToken = keyof typeof theme

export function contextPressureColor(pct: number): string {
  if (pct > 90) return theme.danger
  if (pct >= 70) return theme.warning
  return theme.fgMuted
}

export function effortColor(
  level: 'low' | 'medium' | 'high' | 'max'
): string {
  switch (level) {
    case 'low':
      return theme.effortLow
    case 'high':
      return theme.effortHigh
    case 'max':
      return theme.effortMax
    default:
      return theme.effortMed
  }
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16)
  ]
}

export function lerpHex(a: string, b: string, t: number): string {
  const u = Math.max(0, Math.min(1, t))
  const pa = parseHex(a)
  const pb = parseHex(b)
  const to = (i: number) =>
    Math.round(pa[i]! + (pb[i]! - pa[i]!) * u)
      .toString(16)
      .padStart(2, '0')
  return `#${to(0)}${to(1)}${to(2)}`
}

/** §3.3B: distance from MAX (0) → LOW (3). */
export function maxSpreadIntensity(distanceFromMax: number, phase: number): number {
  const weight = [1, 0.65, 0.38, 0.18][distanceFromMax] ?? 0.18
  const wave = 0.28 * Math.sin(2 * Math.PI * phase - distanceFromMax * 0.55)
  return Math.max(0, Math.min(1, weight + wave))
}

export function modeColor(mode: string): string {
  if (mode === 'plan' || mode === 'auto') return theme.cyan
  if (mode === 'bypassPermissions') return theme.danger
  if (mode === 'acceptEdits') return theme.accent
  return theme.fg
}
