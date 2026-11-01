/** D-02 — theme presets. Accent is the user-facing theme color. */

export type ThemeTokens = {
  bg: string
  fg: string
  fgMuted: string
  /** Darker than fgMuted — thinking body under the gray label. */
  fgDim: string
  accent: string
  /** Headings, bold, table headers — same hue as accent, one step brighter. */
  emphasis: string
  effortLow: string
  effortMed: string
  effortHigh: string
  effortMax: string
  effortMaxPulse: string
  /** ACKEMCODE wordmark — C / O / D / E */
  brandCodeC: string
  brandCodeO: string
  brandCodeD: string
  brandCodeE: string
  cyan: string
  border: string
  promptBorder: string
  success: string
  warning: string
  danger: string
  /** Full-width user-message bar (Claude Code userMessageBackground). */
  userMessageBg: string
  /** In-app drag selection (CC selectionBg). */
  selectionBg: string
}

const BASE = {
  bg: '#070B10',
  fg: '#FFFFFF',
  fgMuted: '#7A8BA3',
  fgDim: '#4A5868',
  effortLow: '#F5D76E',
  effortMed: '#52D070',
  effortMax: '#B47EFF',
  effortMaxPulse: '#E4C4FF',
  brandCodeC: '#F5D76E',
  brandCodeO: '#52D070',
  brandCodeD: '#3D8BFF',
  brandCodeE: '#B47EFF',
  cyan: '#5EE6FF',
  border: '#1A2740',
  promptBorder: '#999999',
  success: '#3DFFC8',
  warning: '#E8A54B',
  danger: '#FF5E7A',
  userMessageBg: '#373737'
} as const

function withAccent(accent: string, emphasis: string, selectionBg: string): ThemeTokens {
  return { ...BASE, accent, emphasis, effortHigh: accent, selectionBg }
}

export const THEME_BLUE = withAccent('#3D8BFF', '#6AADFF', '#2A4568')
export const THEME_YELLOW = withAccent('#A07A28', '#D4B45C', '#3A2E10')
export const THEME_GREEN = withAccent('#247040', '#3DAA62', '#0F2818')
export const THEME_PURPLE = withAccent('#C77DFF', '#D9A4FF', '#3A2458')

/** @deprecated use THEME_BLUE */
export const THEME_ACKEM = THEME_BLUE

export const THEME_IDS = ['blue', 'yellow', 'green', 'purple'] as const
export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_LABELS: Record<ThemeId, string> = {
  blue: '蓝色',
  yellow: '黄色',
  green: '绿色',
  purple: '紫色'
}

export const THEME_PRESETS: Record<ThemeId, ThemeTokens> = {
  blue: THEME_BLUE,
  yellow: THEME_YELLOW,
  green: THEME_GREEN,
  purple: THEME_PURPLE
}

const LEGACY_THEME: Record<string, ThemeId> = {
  ackem: 'blue',
  dim: 'blue',
  ocean: 'green',
  亮紫色: 'purple'
}

export function normalizeThemeId(v: string): ThemeId | null {
  if ((THEME_IDS as readonly string[]).includes(v)) return v as ThemeId
  return LEGACY_THEME[v] ?? null
}

/** Mutable active tokens — Ink reads this object each render. */
export const theme: ThemeTokens = { ...THEME_BLUE }

let activeThemeId: ThemeId = 'blue'

export function currentThemeId(): ThemeId {
  return activeThemeId
}

export function applyTheme(id: ThemeId): void {
  activeThemeId = id
  Object.assign(theme, THEME_PRESETS[id])
}

export function isThemeId(v: string): v is ThemeId {
  return normalizeThemeId(v) != null && (THEME_IDS as readonly string[]).includes(v)
}
