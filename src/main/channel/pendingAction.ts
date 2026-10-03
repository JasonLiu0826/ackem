import { randomUUID } from 'node:crypto'
import type { ChannelPlan, PendingChannelAction, TurnConfirm } from '../../shared/channelPlan'
import { writeGrounding } from './grounding'
import { pendingPlan } from './plans'
import { detectPlanPatch } from './detectPlanPatch'

const TTL_MS = 10 * 60_000
const store = new Map<string, PendingChannelAction[]>()

export type PlanPatch = {
  planId: string
  expectedVersion: number
  cwd?: string
  params?: Record<string, unknown>
  selectedCandidateId?: string
}

export type ConfirmResult =
  | { ok: true; plan: ChannelPlan; next?: PendingChannelAction }
  | { ok: false; reason: string; next?: PendingChannelAction }

function stampPlan(plan: ChannelPlan, planId: string, sourceText: string): ChannelPlan {
  return {
    ...plan,
    planId,
    version: plan.version ?? 0,
    summary: plan.summary ?? sourceText.slice(0, 80)
  }
}

function liveList(chatSessionId: string): PendingChannelAction[] {
  const now = Date.now()
  const next = (store.get(chatSessionId) ?? []).filter((a) => a.expiresAt > now)
  if (next.length) store.set(chatSessionId, next)
  else store.delete(chatSessionId)
  return next
}

function writeList(chatSessionId: string, list: PendingChannelAction[]): void {
  if (list.length) store.set(chatSessionId, list)
  else store.delete(chatSessionId)
}

function toAction(
  sourceText: string,
  plan: ChannelPlan,
  catalogRevision: string
): PendingChannelAction {
  const now = Date.now()
  const planId = plan.planId ?? randomUUID()
  return {
    planId,
    createdAt: now,
    sourceText,
    plan: stampPlan(plan, planId, sourceText),
    catalogRevision,
    expiresAt: now + TTL_MS
  }
}

export function savePendingAction(
  chatSessionId: string,
  sourceText: string,
  plan: ChannelPlan,
  catalogRevision: string
): PendingChannelAction {
  const action = toAction(sourceText, plan, catalogRevision)
  writeList(chatSessionId, [action])
  return action
}

export function savePendingActions(
  chatSessionId: string,
  items: Array<{ sourceText: string; plan: ChannelPlan }>,
  catalogRevision: string
): PendingChannelAction[] {
  const actions = items.map((item) => toAction(item.sourceText, item.plan, catalogRevision))
  writeList(chatSessionId, actions)
  return actions
}

export function peekPendingAction(chatSessionId: string): PendingChannelAction | null {
  return liveList(chatSessionId)[0] ?? null
}

export function peekAllPending(chatSessionId: string): PendingChannelAction[] {
  return liveList(chatSessionId)
}

export function peekPendingForPatch(chatSessionId: string, text: string): PendingChannelAction | null {
  const all = liveList(chatSessionId)
  if (!all.length) return null
  if (/第二|另一件|后面那/.test(text) && all[1]) return all[1]
  return all.find((a) => detectPlanPatch(text, a.plan)) ?? all[0]
}

export const getPendingAction = peekPendingAction

export function clearPendingAction(chatSessionId: string): void {
  store.delete(chatSessionId)
}

export function dismissPending(
  chatSessionId: string,
  planId?: string
): PendingChannelAction | undefined {
  const list = liveList(chatSessionId)
  const id = planId ?? list[0]?.planId
  if (!id) return undefined
  return removeAction(chatSessionId, id)[0]
}

function removeAction(chatSessionId: string, planId: string): PendingChannelAction[] {
  const next = liveList(chatSessionId).filter((a) => a.planId !== planId)
  writeList(chatSessionId, next)
  return next
}

export function applyPlanPatch(
  chatSessionId: string,
  patch: PlanPatch,
  opts: { catalogRevision: string; enabledIds?: string[] }
): { ok: true; plan: ChannelPlan; action: PendingChannelAction } | { ok: false; reason: string } {
  const list = liveList(chatSessionId)
  const saved = list.find((a) => a.planId === patch.planId)
  if (!saved) return { ok: false, reason: 'planId 无效或已过期' }
  if (saved.catalogRevision !== opts.catalogRevision) {
    return { ok: false, reason: '清单已变化，请重新说明需求' }
  }
  const currentVersion = saved.plan.version ?? 0
  if (patch.expectedVersion !== currentVersion) {
    return { ok: false, reason: '草案已更新，请基于当前卡片修改' }
  }

  const prev = saved.plan
  const next: ChannelPlan = { ...prev }
  if (patch.cwd?.trim()) next.cwd = patch.cwd.trim()
  if (patch.params) next.params = { ...prev.params, ...patch.params }
  if (patch.selectedCandidateId) {
    const allowed = prev.candidateExtensionIds ?? (prev.extensionId ? [prev.extensionId] : [])
    if (!allowed.includes(patch.selectedCandidateId)) {
      return { ok: false, reason: '候选不在本卡' }
    }
    if (opts.enabledIds && !opts.enabledIds.includes(patch.selectedCandidateId)) {
      return { ok: false, reason: '候选插件不可用' }
    }
    next.extensionId = patch.selectedCandidateId
  }

  next.channel = prev.channel
  next.intent = prev.intent
  next.workKind = prev.workKind
  next.pendingConfirm = prev.pendingConfirm
  next.planId = saved.planId
  next.version = currentVersion + 1
  next.grounding = writeGrounding(next)

  saved.plan = next
  saved.expiresAt = Date.now() + TTL_MS
  writeList(chatSessionId, list)
  return { ok: true, plan: next, action: saved }
}

export function applyTurnConfirm(
  chatSessionId: string,
  confirm: TurnConfirm,
  opts: { catalogRevision: string; enabledIds: string[] }
): ConfirmResult {
  const list = liveList(chatSessionId)
  const saved = list.find((a) => a.planId === confirm.planId)
  if (!saved) return { ok: false, reason: 'planId 无效或已过期' }
  if (!confirm.accepted) {
    const remaining = removeAction(chatSessionId, saved.planId)
    return { ok: false, reason: '用户拒绝', next: remaining[0] }
  }
  if (saved.catalogRevision !== opts.catalogRevision) {
    return { ok: false, reason: '清单已变化，请重新说明需求' }
  }

  let plan = { ...saved.plan }
  if (confirm.cwd?.trim()) plan.cwd = confirm.cwd.trim()
  if (confirm.extensionId) {
    const allowed = plan.candidateExtensionIds ?? (plan.extensionId ? [plan.extensionId] : [])
    if (!allowed.includes(confirm.extensionId) || !opts.enabledIds.includes(confirm.extensionId)) {
      return { ok: false, reason: '候选插件不可用' }
    }
    plan.extensionId = confirm.extensionId
  }

  if (plan.pendingConfirm === 'use_missing') {
    const nextPlan = pendingPlan('create', {
      intent: 'create',
      workKind: 'factory',
      tag: plan.tag,
      params: plan.params
    })
    const nextAction = toAction(saved.sourceText, nextPlan, saved.catalogRevision)
    writeList(
      chatSessionId,
      list.map((a) => (a.planId === saved.planId ? nextAction : a))
    )
    return { ok: true, plan: nextAction.plan, next: liveList(chatSessionId).find((a) => a.planId !== nextAction.planId) }
  }

  if (plan.pendingConfirm === 'plugin_ask' || plan.pendingConfirm === 'plugin_use') {
    if (!plan.extensionId) return { ok: false, reason: '请选择一个插件' }
    plan = {
      ...plan,
      channel: 'plugin',
      pendingConfirm: undefined,
      grounding: writeGrounding({ channel: 'plugin', extensionId: plan.extensionId })
    }
    const remaining = removeAction(chatSessionId, saved.planId)
    return { ok: true, plan, next: remaining[0] }
  }

  if (plan.pendingConfirm === 'work_job' && !plan.cwd) {
    return { ok: false, reason: '请先选择工作目录' }
  }

  plan = {
    ...plan,
    pendingConfirm: undefined,
    grounding: writeGrounding(plan)
  }
  const remaining = removeAction(chatSessionId, saved.planId)
  return { ok: true, plan, next: remaining[0] }
}

export function resetPendingStore(): void {
  store.clear()
}
