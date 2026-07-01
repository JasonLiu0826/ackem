import type { AttentionBudgetState } from './types'
import { DEFAULT_PROACTIVE_PER_HOUR } from './types'
import {
  loadAttentionBudgetFromStore,
  loadPolicyStore,
  saveAttentionBudgetToStore,
  savePolicyStore
} from './policyStore'

const HOUR_MS = 60 * 60 * 1000

export function defaultAttentionBudget(): AttentionBudgetState {
  return {
    proactiveMessagesPerHour: DEFAULT_PROACTIVE_PER_HOUR,
    lastProactiveAt: [],
    categoryCooldown: {}
  }
}

export function loadAttentionBudget(dataRoot: string): AttentionBudgetState {
  return loadAttentionBudgetFromStore(dataRoot)
}

export function saveAttentionBudget(dataRoot: string, state: AttentionBudgetState): void {
  saveAttentionBudgetToStore(dataRoot, state)
}

function pruneLastProactive(timestamps: number[], now: number): number[] {
  const cutoff = now - HOUR_MS
  return timestamps.filter((t) => t >= cutoff)
}

export function isAttentionBudgetExceeded(state: AttentionBudgetState, now: number): boolean {
  const recent = pruneLastProactive(state.lastProactiveAt, now)
  return recent.length >= state.proactiveMessagesPerHour
}

export function isGlobalDndActive(state: AttentionBudgetState, now: number): boolean {
  const until = state.globalDnd?.until
  return typeof until === 'number' && until > now
}

/** autonomous 成功发出 proactive 后调用 */
export function recordProactiveMessage(dataRoot: string, now = Date.now()): AttentionBudgetState {
  const state = loadAttentionBudget(dataRoot)
  state.lastProactiveAt = [...pruneLastProactive(state.lastProactiveAt, now), now]
  saveAttentionBudget(dataRoot, state)
  return state
}

export function setGlobalDnd(
  dataRoot: string,
  untilMs: number,
  reason: string
): AttentionBudgetState {
  const store = loadPolicyStore(dataRoot)
  store.globalDnd = { until: untilMs, reason }
  savePolicyStore(dataRoot, store)
  return loadAttentionBudget(dataRoot)
}

/** 清除 globalDnd；可选仅清除指定 reason（如 focus_assist） */
export function clearGlobalDnd(dataRoot: string, reason?: string): AttentionBudgetState {
  const store = loadPolicyStore(dataRoot)
  if (!store.globalDnd) return loadAttentionBudget(dataRoot)
  if (reason && store.globalDnd.reason !== reason) return loadAttentionBudget(dataRoot)
  delete store.globalDnd
  savePolicyStore(dataRoot, store)
  return loadAttentionBudget(dataRoot)
}
