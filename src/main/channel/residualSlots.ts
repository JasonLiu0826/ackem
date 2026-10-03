import type { IntentJson } from '../../shared/intentProtocol'
import { extractCwdHint } from './detectMotive'

export const SLOT_KEYS = new Set([
  'cwd',
  'durationMin',
  'duration',
  'schedule',
  'delivery',
  'feature',
  'topic',
  'query'
])

export function pickSlots(raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!SLOT_KEYS.has(k)) continue
    if (v == null || typeof v === 'object') continue
    out[k] = v
  }
  return out
}

/** 原话事实压过模型槽。 */
export function extractResidualSlots(
  text: string,
  json?: IntentJson | null
): Record<string, unknown> {
  const fromModel = pickSlots(json?.params)
  const fromText: Record<string, unknown> = {}
  const dur = text.match(/(\d+)\s*(?:分钟|minutes?\b|min\b)/i)
  if (dur) fromText.durationMin = Number(dur[1])
  const cwd = extractCwdHint(text)
  if (cwd) fromText.cwd = cwd
  if (/工作日/.test(text)) fromText.schedule = 'workdays'
  if (/每天/.test(text)) fromText.schedule = fromText.schedule ?? 'daily'
  return { ...fromModel, ...fromText }
}
