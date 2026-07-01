import type { DispatchResult } from '../protocols'
import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit,
  extractBareFeatureCreateTopic
} from './explicitDispatch'
import { shouldRunCapabilityProbe } from '../openforu/extensionIntentClassifier'

export type DispatchHonestyInput = {
  userText: string
  dispatchResult?: DispatchResult
}

export type DispatchHonestyBypassKind = 'create' | 'schedule' | 'both'

const ROUTED_DECISIONS = new Set<DispatchResult['decision']>([
  'plan',
  'ask_plan',
  'ask_invoke',
  'auto_invoke',
  'evolve',
  'open_surface',
  'invoke_surface'
])

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

/** 用户像在要「可部署扩展」，但本轮未进 Plan / invoke */
export function detectMissedExtensionCreateIntent(userText: string): boolean {
  const trimmed = userText.trim()
  if (!trimmed) return false
  if (detectExtensionDemandExplicit(trimmed)) return true
  if (detectBareFeatureCreateCandidate(trimmed)) return true
  if (shouldRunCapabilityProbe(trimmed)) return true
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

function buildExtensionCreateHonestyHint(userText: string): string {
  const topic = extractBareFeatureCreateTopic(userText)?.trim()
  const topicLine = topic
    ? `用户似乎在请求「${topic}」一类可重复使用的扩展/自动化能力，`
    : '用户似乎在请求可重复使用的扩展/自动化能力，'

  return [
    '【诚实护栏 · 扩展创建 · 硬性】',
    `${topicLine}但本轮未进入 Plan 或扩展调度（dispatchBypassed）。`,
    '禁止口头承诺你已经或即将为用户编写 Skill/插件/扩展、部署代码、设置后台定时任务，或说「明天给你弄」「稍等我就做好」「已经帮你做好了」等假执行。',
    '禁止假装本轮已创建、已部署、已启用某 uskill/uplugin。',
    '用伴侣口吻诚实说明：这类能力需要 OpenForU Plan 正式流程才能落地；可邀请用户改说「帮我做一个 XX Skill/插件」进入 Plan，或仅给普通聊天层面的有限建议（不承诺代写代码/代部署）。',
    '若用户只是闲聊或一次性问答，勿过度拒答；但仍不得假承诺扩展开发。'
  ].join('\n')
}

function extractScheduledReminderTopic(userText: string): string | undefined {
  const trimmed = userText.trim()
  const m = trimmed.match(
    /((?:明天|后天|大后天|今天|每晚|明早|明晚|每天|每日)[^，。！？\n]{0,12}?(?:\d{1,2}\s*[点时:：]?\s*\d{0,2}|\d{1,2}\s*点)[^，。！？\n]{0,6}?(?:叫|提醒|闹钟)?)/iu
  )
  if (m?.[1]) {
    const topic = m[1].replace(/\s+/g, '').slice(0, 16)
    if (topic.length >= 2) return topic
  }
  if (/定时/.test(trimmed)) {
    const short = trimmed.replace(/[，。！？!?]/g, '').slice(0, 12)
    if (short.length >= 4) return short
  }
  return undefined
}

function buildScheduledReminderHonestyHint(userText: string): string {
  const topic = extractScheduledReminderTopic(userText)
  const skillName = topic ? `${topic}提醒` : '到点提醒'
  const inviteLine = topic
    ? `主动、自然地邀请用户改说：「帮我做一个${skillName} Skill」或「帮我做一个${skillName}插件」，进入 OpenForU Plan。`
    : '主动、自然地邀请用户改说：「帮我做一个到点提醒 Skill/插件」，进入 OpenForU Plan。'

  return [
    '【诚实护栏 · 定时提醒 · 硬性 · 贾维斯式引导】',
    '用户似乎在请求定时/闹钟/到点提醒，但本轮未进入任何扩展调度（无 autonomous uskill/uplugin、无 Plan）。',
    '禁止口头承诺你已经或即将设置闹钟、定时任务、到点叫用户，或说「好的我会叫你」「已经设好了」「明天准时提醒」等假执行。',
    '回复结构（保持伴侣人格与情绪引擎语气，但内容须包含以下三层，顺序可自然调整）：',
    '1) 诚实边界：本轮聊天本身不能代设系统闹钟/后台定时；Ackem 真到点提醒 = 部署 autonomous 类 uskill/uplugin 后由调度器执行（toast 或系统通知）。',
    `2) 贾维斯式引导创作（必做）：${inviteLine} 说明 Plan 里几轮对话可定规则、确认后 deploy，之后到点会真触发——这是「我能帮你造能力」，不是空口答应。`,
    '3) 务实备选（一句即可）：若用户只想这一次，可建议用手机/系统自带提醒；但仍优先推荐 Plan 路径做可复用提醒。',
    '禁止只怼用户「自己设去」而不提 Plan 创作路径；禁止假装本轮已部署。',
    '若用户只是随口约定（如「明天见」）而非定时提醒，勿过度拒答。'
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
