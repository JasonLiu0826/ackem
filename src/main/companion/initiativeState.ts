import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { companionGate, type CompanionGateState } from './proactivePolicy'
import { resolveDataRoot } from '../paths'
import { loadSettings } from '../settings'
import { engineSessionId } from '../session/canonical'
import { isChatStreaming } from '../desktop-agent/deliveryCoordinator'
import { resolveUserTimezone } from '../memory/temporal/timezonePolicy'
import { zonedDateParts, zonedLocalDate } from '../memory/temporal/zonedDate'
const activeTasks = new Set<string>()
let lastActivity = 0
export function touchCompanionActivity(): void { lastActivity = Date.now() }
export function setCompanionTaskBusy(runId: string, busy: boolean): void { if (busy) activeTasks.add(runId); else activeTasks.delete(runId) }
function path(root: string): string { return join(root, 'companion', 'initiative-policy.json') }
function read(root: string): CompanionGateState {
  try { const state = JSON.parse(readFileSync(path(root), 'utf8')); if (Number.isFinite(state.lastSent) && Number.isFinite(state.count) && typeof state.date === 'string' && typeof state.lastText === 'string') return { ...state, lastUserActivity: Math.max(Number(state.lastUserActivity) || 0, lastActivity) } } catch { /* first run */ }
  return { lastUserActivity: lastActivity, lastSent: 0, date: '', count: 0, lastText: '' }
}
export function canSendCompanionInitiative(text?: string): boolean {
  const settings = loadSettings(), root = resolveDataRoot(settings), date = new Date(), timezone = resolveUserTimezone(settings.timezone).timezone
  return companionGate({ settings, state: read(root), now: date.getTime(), date: zonedLocalDate(date, timezone), hour: zonedDateParts(date, timezone).hour,
    busy: activeTasks.size > 0 || isChatStreaming(engineSessionId()), text })
}
export function recordCompanionInitiative(text: string): void {
  const settings = loadSettings(), root = resolveDataRoot(settings), date = zonedLocalDate(new Date(), resolveUserTimezone(settings.timezone).timezone), state = read(root)
  const next = { ...state, lastSent: Date.now(), date, count: state.date === date ? state.count + 1 : 1, lastText: text.slice(0, 400) }
  const dir = join(root, 'companion'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const temp = path(root) + '.tmp'; writeFileSync(temp, JSON.stringify(next), 'utf8'); renameSync(temp, path(root))
}
