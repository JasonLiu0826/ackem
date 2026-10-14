import type { DispatchResult } from '../protocols'
import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit
} from './explicitDispatch'
import { hasCapabilityGapHint } from '../../channel/gapHint'

export type DispatchHonestyInput = {
  userText: string
  dispatchResult?: DispatchResult
}

export type DispatchHonestyBypassKind = 'create' | 'schedule' | 'both'

const ROUTED_DECISIONS = new Set<DispatchResult['decision']>(['auto_invoke'])

/** 到点 / 相对时间 / 日历日 */
const SCHEDULE_TIME_RE =
  /(?:\d{1,2}\s*[点时:：]\s*\d{0,2}|\d{1,2}\s*点|\d+\s*(?:分钟|小时|min|h)\s*后|早上|上午|中午|下午|晚上|凌晨|半夜)/iu

const SCHEDULE_DAY_RE =
  /(?:明天|后天|大后天|今天|今晚|明早|明晚|每日|每天|每隔|每周|工作日|周末|周[一二三四五六日天])/iu

/** 用户像在要「到点提醒 / 闹钟 / 定时通知」 */
const REMINDER_ACTION_RE =
  /(?:叫我|提醒(?:我|一下)?|闹钟|定时(?:提醒|任务|叫)?|到点(?:叫|提醒)|记得叫|通知我|别忘(?:记)?叫)/iu

/** 纯能力/meta 问句，非当下请求 */
const SCHEDULE_META_QUESTION_RE =
  /(?:能不能|可不可以|是否可以|会不会|支持(?:不)?|有没有).{0,12}(?:定时|提醒|闹钟)/iu

/** 用户像在要「可部署扩展」，但本轮未派发任务 / invoke */
export function detectMissedExtensionCreateIntent(userText: string): boolean {
  const trimmed = userText.trim()
  if (!trimmed) return false
  if (detectExtensionDemandExplicit(trimmed)) return true
  if (detectBareFeatureCreateCandidate(trimmed)) return true
  if (hasCapabilityGapHint(trimmed)) return true
  return false
}

/** 用户像在要「定时 / 闹钟 / 到点提醒」，但本轮未进 Dispatch */
export function detectMissedScheduledReminderIntent(userText: string): boolean {
  const trimmed = userText.trim()
  if (!trimmed || trimmed.length < 4) return false
  if (!REMINDER_ACTION_RE.test(trimmed)) return false
  if (SCHEDULE_META_QUESTION_RE.test(trimmed) && !SCHEDULE_TIME_RE.test(trimmed)) return false
  if (SCHEDULE_TIME_RE.test(trimmed) || SCHEDULE_DAY_RE.test(trimmed)) return true
  if (/定时/.test(trimmed)) return true
  return false
}

export function detectMissedHonestyIntent(userText: string): DispatchHonestyBypassKind | null {
  const create = detectMissedExtensionCreateIntent(userText)
  const schedule = detectMissedScheduledReminderIntent(userText)
  if (create && schedule) return 'both'
  if (create) return 'create'
  if (schedule) return 'schedule'
  return null
}

export function shouldApplyDispatchHonestyGuard(input: DispatchHonestyInput): boolean {
  const decision = input.dispatchResult?.decision
  if (decision && ROUTED_DECISIONS.has(decision)) return false
  return detectMissedHonestyIntent(input.userText) != null
}

export function buildDispatchHonestySystemHint(
  userText: string,
  kind: DispatchHonestyBypassKind = detectMissedHonestyIntent(userText) ?? 'create'
): string {
  const parts: string[] = []
  if (kind === 'create' || kind === 'both') {
    parts.push(buildExtensionCreateHonestyHint(userText))
  }
  if (kind === 'schedule' || kind === 'both') {
    parts.push(buildScheduledReminderHonestyHint(userText))
  }
  return parts.join('\n\n')
}

function buildExtensionCreateHonestyHint(_userText: string): string {
  return [
    '【本轮事实 · 插件创建尚未派发】',
    '创建或修改插件由 work 通道的 AckemCode 任务完成。本轮尚未派发任务，不声称已编写、已部署、已启用插件或已设置定时任务。',
    '自然回应需求，必要时只问阻碍执行的关键信息，按当前任务确认卡流程推进；不要要求用户换成某句固定触发口令，也不虚构确认卡或收据。'
  ].join('\n')
}

function buildScheduledReminderHonestyHint(_userText: string): string {
  return [
    '【本轮事实 · 提醒尚未设置】',
    '本轮没有提醒执行回执，不声称已设置或保证届时通知。已有匹配且启用的提醒插件由 plugin 通道执行；需要创建新能力时走 AckemCode 任务，经确认后才执行。',
    '依据实际能力与路由回应；必要时澄清具体时间或对象。不强制用户开发插件，不为一次普通提醒推荐复杂创作流程。随口约定不当成定时任务。'
  ].join('\n')
}

export function resolveDispatchHonestyGuard(input: DispatchHonestyInput): {
  dispatchBypassed: boolean
  systemHint: string
  bypassKind?: DispatchHonestyBypassKind
} {
  const decision = input.dispatchResult?.decision
  if (decision && ROUTED_DECISIONS.has(decision)) {
    return { dispatchBypassed: false, systemHint: '' }
  }

  const bypassKind = detectMissedHonestyIntent(input.userText)
  const dispatchBypassed = bypassKind != null
  return {
    dispatchBypassed,
    bypassKind: bypassKind ?? undefined,
    systemHint: dispatchBypassed ? buildDispatchHonestySystemHint(input.userText, bypassKind!) : ''
  }
}
