import { createLlmJsonClient } from '../llmClient'
import { loadState } from '../engine/state-persistence'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import type { AppSettings } from '../settings'
import { getTimeContext } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'
import {
  sanitizeDesktopProactiveMessage,
  templateDesktopProactiveMessage
} from '../extensions/plugins/builtin/desktop-companion/proactiveNotificationMessage'
import { createLogger } from '../logger'
import {
  buildProactivePersonalityBlock,
  pickCompanionProactiveKind,
  pickPersonalityProactiveFallback,
  type ProactiveMessageKind
} from './proactivePersonalityContext'

const log = createLogger('companion-proactive-compose')

export type { ProactiveMessageKind }

export type ComposeCompanionProactiveInput = {
  dataRoot: string
  settings: AppSettings
  sessionId: string
  /** 骚扰模式：更黏人、更撒娇，间隔由调度器控制 */
  harass?: boolean
}

export function pickRecentFactFromRoot(dataRoot: string): string | null {
  try {
    const store = new FactStore(defaultFactsPath(dataRoot))
    store.load()
    const active = store.listActive()
    if (!active.length) return null
    const sorted = [...active].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    const s = sorted[0]?.summary?.trim()
    return s ? s.slice(0, 48) : null
  } catch {
    return null
  }
}

export { pickCompanionProactiveKind }

const KIND_HINT: Record<ProactiveMessageKind, string> = {
  check_in: '随口确认对方在不在、近况如何',
  memory_echo: '轻点提起对方之前说过的事，像真的记得',
  time_greet: '按当前时段自然打招呼',
  miss_you: '表达想念或想聊天，符合关系亲密度',
  playful_nudge: '带一点人格特色的撒娇/调侃，不要客服腔'
}

async function tryLlmCompanionProactive(args: {
  settings: AppSettings
  relationship: { stage: string; trust: number }
  emotion: { aff: number; primaryLabel?: string; aro?: number; sec?: number }
  fact: string | null
  presetId: string
  kind: ProactiveMessageKind
  harass?: boolean
}): Promise<string | null> {
  try {
    const tc = getTimeContext()
    const llm = createLlmJsonClient(args.settings)
    const personalityBlock = buildProactivePersonalityBlock({
      presetId: args.presetId,
      settings: args.settings,
      aff: args.emotion.aff,
      harass: args.harass
    })
    const factLine = args.fact ? `\n可轻点提到：${args.fact}` : ''
    const topics =
      tc.topicHints.length > 0 ? `\n时段可自然聊到：${tc.topicHints.join('、')}` : ''
    const channelLine = args.harass
      ? '你要在桌面 Ackem 聊天里主动发消息。'
      : '用户暂时没回，你主动发一条微信。'

    const formatLine = args.harass
      ? '只输出对用户直接说的 1～2 句正文，总共 ≤40 字，可用 [SPLIT] 分两条。'
      : '只输出 1 句对用户直接说的话，≤40 字；不要用 [SPLIT] 或任何方括号标记（系统会按句自动分条发送）。'

    const request = {
      messages: [
        {
          role: 'system' as const,
          content:
            `你是 Ackem，用户的 AI 伴侣。${channelLine}\n\n${personalityBlock}\n\n` +
            '禁止输出：设定说明、状态分析、任务复述、写作计划、数字指标、括号及括号内旁白、第三人称内心独白。' +
            `${formatLine} ` +
            '不要客服腔，不要提 DeepSeek/GPT。'
        },
        {
          role: 'user' as const,
          content:
            `（内部参考，勿复述）关系 ${args.relationship.stage}；` +
            `信任 ${args.relationship.trust}；好感 ${args.emotion.aff}；` +
            `安全感 ${args.emotion.sec ?? 0}；` +
            `情绪 ${args.emotion.primaryLabel ?? '平静'}；${tc.greeting}。` +
            `任务：${KIND_HINT[args.kind]}。${factLine}${topics}\n` +
            '请直接写正文：'
        }
      ],
      temperature: args.harass ? 0.88 : 0.82,
      max_tokens: 192
    }

    let result = await llm.chatCompletionJsonDetailed(request)
    let cleaned = sanitizeDesktopProactiveMessage(result.text, 120)

    if ((!cleaned || result.truncated) && !args.harass) {
      result = await llm.chatCompletionJsonDetailed({
        ...request,
        temperature: 0.72
      })
      cleaned = sanitizeDesktopProactiveMessage(result.text, 120)
    }

    return cleaned
  } catch (e) {
    log.warn('LLM companion proactive generation failed', { error: String(e) })
    return null
  }
}

export async function composeCompanionProactiveMessage(
  input: ComposeCompanionProactiveInput
): Promise<{ raw: string; kind: ProactiveMessageKind } | null> {
  const state = loadState(input.dataRoot, input.sessionId)
  if (!state) return null
  if (state.relationship.stage === 'STRANGER' && state.relationship.trust < 35) {
    return null
  }

  const presetId = input.settings.personalityPresetId
  const fact = pickRecentFactFromRoot(input.dataRoot)
  const kind = pickCompanionProactiveKind({
    fact,
    aff: state.emotion.aff,
    stage: state.relationship.stage,
    harass: input.harass,
    presetId
  })

  const raw = await tryLlmCompanionProactive({
    settings: input.settings,
    relationship: state.relationship,
    emotion: state.emotion,
    fact,
    presetId,
    kind,
    harass: input.harass
  })

  if (!raw?.trim()) {
    const fallback = pickPersonalityProactiveFallback(
      presetId,
      state.emotion.aff,
      !!input.harass
    )
    if (!fallback) return null
    return { raw: fallback, kind }
  }

  const sanitized = sanitizeDesktopProactiveMessage(raw.trim(), 120)
  if (sanitized) return { raw: sanitized, kind }

  const tc = getTimeContext()
  return { raw: templateDesktopProactiveMessage(tc), kind }
}
