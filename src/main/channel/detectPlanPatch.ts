import type { ChannelPlan } from '../../shared/channelPlan'
import { extractCwdHint } from './detectMotive'
import type { PlanPatch } from './pendingAction'

const CANDIDATE_HINT = /第\s*([123])\s*[个条项]|第一个|第二个|第三个|选这个|就要这个/
const WORKDAY = /工作日|每天|每天早上|每天晚上|每周|工作日早上/
const PARAM_KV = /(?:默认|改成|设为|参数)\s*[:：]?\s*([^\s，。]{1,40})/

export function detectPlanPatch(text: string, plan: ChannelPlan): PlanPatch | null {
  const cwdHint = extractCwdHint(text)
  const cwd = cwdHint && (plan.pendingConfirm === 'work_job' || plan.channel === 'work') ? cwdHint : undefined
  const selectedCandidateId = pickCandidate(text, plan)
  const params = pickParams(text, plan)
  if (!plan.planId || (!cwd && !selectedCandidateId && !params)) return null
  return {
    planId: plan.planId,
    expectedVersion: plan.version ?? 0,
    cwd,
    params,
    selectedCandidateId
  }
}

function candidatesOf(plan: ChannelPlan): Array<{ id: string; name: string }> {
  if (plan.candidates?.length) return plan.candidates
  return (plan.candidateExtensionIds ?? []).map((id) => ({ id, name: id }))
}

function pickCandidate(text: string, plan: ChannelPlan): string | undefined {
  const candidates = candidatesOf(plan)
  if (!candidates.length) return undefined
  if (!CANDIDATE_HINT.test(text) && !candidates.some((c) => text.includes(c.name) || text.includes(c.id))) {
    return undefined
  }
  const numbered = text.match(/第\s*([123])\s*[个条项]/)
  if (numbered) {
    const i = Number(numbered[1]) - 1
    return candidates[i]?.id
  }
  if (/第一个/.test(text)) return candidates[0]?.id
  if (/第二个/.test(text)) return candidates[1]?.id
  if (/第三个/.test(text)) return candidates[2]?.id
  const byName = candidates.find((c) => text.includes(c.name) || text.includes(c.id))
  return byName?.id ?? (/选这个|就要这个/.test(text) ? candidates[0]?.id : undefined)
}

function pickParams(text: string, plan: ChannelPlan): Record<string, unknown> | undefined {
  if (plan.channel !== 'plugin' && plan.workKind !== 'factory') {
    if (WORKDAY.test(text)) return { scheduleHint: 'workdays' }
    return undefined
  }
  const next: Record<string, unknown> = { ...(plan.params ?? {}) }
  let hit = false
  if (WORKDAY.test(text)) {
    next.schedule = 'workdays'
    hit = true
  }
  const kv = PARAM_KV.exec(text)
  if (kv) {
    next.hint = kv[1]
    hit = true
  }
  return hit ? next : undefined
}
