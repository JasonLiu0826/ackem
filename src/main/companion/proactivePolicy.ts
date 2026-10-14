import type { AppSettings } from '../settings'
export type CompanionGateState = { lastUserActivity: number; lastSent: number; date: string; count: number; lastText: string }
export function companionGate(input: { settings: AppSettings; state: CompanionGateState; now: number; hour: number; date: string; busy: boolean; text?: string }): boolean {
  const { settings, state, now } = input
  if (settings.companionshipProactiveEnabled !== true || settings.companionInteractionMode !== 'companionship' || input.busy) return false
  if (settings.companionshipQuietHours !== false && (input.hour < 8 || input.hour >= 22)) return false
  if (now - state.lastUserActivity < Math.max(300_000, settings.proactiveUserQuietMs ?? 300_000)) return false
  // One unanswered initiative is enough; user activity is needed before another.
  if (state.lastSent && state.lastUserActivity <= state.lastSent) return false
  const cooldown = settings.proactiveFrequency === 'high' ? 1_800_000 : 3_600_000
  if (state.lastSent && now - state.lastSent < cooldown) return false
  if (state.date === input.date && state.count >= 2) return false
  if (input.text && normalize(input.text) === normalize(state.lastText)) return false
  return true
}
function normalize(text: string): string { return text.replace(/[\s，。！？,.!?]/g, '').toLowerCase() }
