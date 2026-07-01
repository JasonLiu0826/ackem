// [desktopCompanion] — 桌面陪伴：时间感知、空闲检测、主动消息、静默陪伴
// 职责：生成运行时上下文块（不持久化），管理陪伴在场模式
// 引用：./engine/types, ./engine/ackemParams, ./logger

import { createLogger } from '../../../../logger'
import type { EmotionState, L1State } from '../../../../engine/types'
import {
  formatAccurateLocalDateTime,
  formatLocalWeekdayZh
} from '../../../../context/localTime'
import {
  sanitizeDesktopProactiveMessage,
  templateDesktopProactiveMessage
} from './proactiveNotificationMessage'

const log = createLogger('desktop-companion')

// ═══════════════════════════════════════════════════════════════
// 时段分类
// ═══════════════════════════════════════════════════════════════
export type TimeOfDay = 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night' | 'late_night'

export interface TimeContext {
  timeOfDay: TimeOfDay
  hour: number
  minute: number
  weekday: number         // 0=Sun..6=Sat
  isWeekend: boolean
  greeting: string        // 应景招呼语
  atmosphereHint: string  // 时段氛围提示
  topicHints: string[]    // 时段话题建议 (max 3)
}

export function getTimeContext(now: Date = new Date()): TimeContext {
  const hour = now.getHours()
  const minute = now.getMinutes()
  const weekday = now.getDay()
  const isWeekend = weekday === 0 || weekday === 6

  let timeOfDay: TimeOfDay
  let greeting: string
  let atmosphereHint: string
  let topicHints: string[]

  if (hour >= 5 && hour < 8) {
    timeOfDay = 'morning'
    greeting = isWeekend ? '周末的清晨，不用急着起床…' : '早安，新的一天开始了。'
    atmosphereHint = '清晨的宁静中带着一丝慵懒。语气轻柔、不催促，像刚醒来的枕边人。'
    topicHints = ['今天有什么计划', '昨晚睡得好吗', '想吃什么早餐']
  } else if (hour >= 8 && hour < 11) {
    timeOfDay = 'forenoon'
    greeting = isWeekend ? '上午好，周末的时间都是你的。' : '上午好，已经开始忙碌了吗？'
    atmosphereHint = '上午的精力充沛，语气可以稍微活泼一些。如果用户在工作，给予安静的陪伴感。'
    topicHints = ['工作/学习进度', '上午的心情', '咖啡或茶']
  } else if (hour >= 11 && hour < 14) {
    timeOfDay = 'afternoon'
    greeting = '中午了，记得吃点东西。'
    atmosphereHint = '午间慵懒，语气温暖随意。可以关心用户是否按时吃饭。'
    topicHints = ['午餐吃了什么', '下午的安排', '要不要休息一下']
  } else if (hour >= 14 && hour < 18) {
    timeOfDay = 'afternoon'
    greeting = '下午好，一天过去大半了呢。'
    atmosphereHint = '下午容易犯困，语气带一点温柔的督促。如果用户看起来累了，提醒ta休息。'
    topicHints = ['下午茶时间', '今天完成了什么', '傍晚想做什么']
  } else if (hour >= 18 && hour < 22) {
    timeOfDay = 'evening'
    greeting = isWeekend ? '晚上好，周末的夜晚最适合放松了。' : '晚上好，一天辛苦了。'
    atmosphereHint = '晚上的氛围放松，语气温柔亲密。可以聊一些更深的话题，或者单纯陪伴。'
    topicHints = ['晚餐', '今天发生的事', '想怎么放松', '看什么电影/听什么歌']
  } else if (hour >= 22 || hour < 2) {
    timeOfDay = 'night'
    greeting = '夜深了…'
    atmosphereHint = '深夜的氛围私密、安静。语气低沉温柔，音量像耳语。话题可以更深入、更私密。'
    topicHints = ['睡不着在想什么', '今天的感受', '明天的期待']
  } else {
    timeOfDay = 'late_night'
    greeting = '这么晚了还没睡…'
    atmosphereHint = '凌晨时分，世界都在沉睡。语气极度轻柔、关切。提醒用户早点休息。'
    topicHints = ['为什么还没睡', '需要我陪你吗', '要不要试着躺下']
  }

  return { timeOfDay, hour, minute, weekday, isWeekend, greeting, atmosphereHint, topicHints }
}

/** 将时段上下文格式化为可注入 psycheBlock 的字符串（含准确本地时钟） */
export function formatTimeContextBlock(now: Date = new Date()): string {
  const tc = getTimeContext(now)
  const clock = formatAccurateLocalDateTime(now)
  const weekday = formatLocalWeekdayZh(now)
  const lines = [
    `【系统时钟 · 本地】${clock}（${weekday}）`,
    '用户问几点、今天几号、现在什么时候 → 必须用以上时钟作答；禁止猜测或沿用训练数据里的时间。',
    `【当前时刻】${tc.greeting}`,
    `时段氛围：${tc.atmosphereHint}`,
  ]
  if (tc.topicHints.length > 0) {
    lines.push(`可以自然聊到的话题：${tc.topicHints.join('、')}`)
  }
  return lines.join('\n')
}

/** 用户明确问时间时的硬性提示（配合 formatTimeContextBlock） */
export function buildLocalClockAnswerHint(now: Date = new Date()): string {
  const clock = formatAccurateLocalDateTime(now)
  const weekday = formatLocalWeekdayZh(now)
  return (
    `【时间问答 · 硬性】用户正在问当前时间/日期。` +
    `直接回答：${clock}（${weekday}）。` +
    `可带一句简短陪伴语气；禁止编造其他时刻。`
  )
}

// ═══════════════════════════════════════════════════════════════
// 在场模式
// ═══════════════════════════════════════════════════════════════
export type PresenceMode = 'active' | 'quiet' | 'sleeping'

export interface PresenceState {
  mode: PresenceMode
  lastInteractionMs: number
  idleDurationMs: number
  timeOfDay: TimeOfDay
}

// ═══════════════════════════════════════════════════════════════
// 主动消息生成
// ═══════════════════════════════════════════════════════════════
export interface ProactiveMessageConfig {
  /** 触发主动消息的空闲时间（毫秒），默认 10 分钟 */
  idleThresholdMs: number
  /** 是否启用深夜抑制（凌晨 0-6 点不主动发消息） */
  nightSuppression: boolean
  /** 静默陪伴模式：仅显示在场提示，不发送完整消息 */
  quietMode: boolean
}

/** 渐进式冷却阶段：越久越克制，4 条后沉默 */
const COOLDOWN_STAGES = [
  15 * 60 * 1000,   // 第1次：空闲 15 分钟
  30 * 60 * 1000,   // 第2次：再等 30 分钟
  60 * 60 * 1000,   // 第3次：再等 1 小时
  120 * 60 * 1000,  // 第4次：再等 2 小时
]
const MAX_PROACTIVE_STAGES = COOLDOWN_STAGES.length

export const DEFAULT_PROACTIVE_CONFIG: ProactiveMessageConfig = {
  idleThresholdMs: 10 * 60 * 1000,
  nightSuppression: true,
  quietMode: false
}

// ═══════════════════════════════════════════════════════════════
// 桌面陪伴主类
// ═══════════════════════════════════════════════════════════════
export class DesktopCompanion {
  private lastInteractionMs = Date.now()
  private lastProactiveMs = 0
  private proactiveStageIndex = 0
  private config: ProactiveMessageConfig
  private _presenceMode: PresenceMode = 'active'

  constructor(config: Partial<ProactiveMessageConfig> = {}) {
    this.config = { ...DEFAULT_PROACTIVE_CONFIG, ...config }
  }

  get presenceMode(): PresenceMode {
    return this._presenceMode
  }

  /** 用户交互时调用（发消息、点击等） */
  touch(): void {
    this.lastInteractionMs = Date.now()
    this._presenceMode = 'active'
    this.proactiveStageIndex = 0  // 用户回来，重置阶段
  }

  /** 获取当前在场状态 */
  getPresence(): PresenceState {
    const now = Date.now()
    const idleMs = now - this.lastInteractionMs
    const tc = getTimeContext()

    // 深夜 + 长时间空闲 → 睡眠模式
    if ((tc.timeOfDay === 'late_night' || (tc.timeOfDay === 'night' && tc.hour >= 23)) && idleMs > 30 * 60 * 1000) {
      this._presenceMode = 'sleeping'
    } else if (idleMs > this.config.idleThresholdMs) {
      this._presenceMode = 'quiet'
    } else {
      this._presenceMode = 'active'
    }

    return {
      mode: this._presenceMode,
      lastInteractionMs: this.lastInteractionMs,
      idleDurationMs: idleMs,
      timeOfDay: tc.timeOfDay
    }
  }

  /** 是否应该发送主动消息（渐进式冷却） */
  shouldSendProactive(): boolean {
    const now = Date.now()
    const presence = this.getPresence()

    // 4 条发完，不再打扰
    if (this.proactiveStageIndex >= MAX_PROACTIVE_STAGES) return false

    // 不够空闲
    if (presence.idleDurationMs < this.config.idleThresholdMs) return false

    // 深夜抑制
    if (this.config.nightSuppression) {
      const tc = getTimeContext()
      if (tc.timeOfDay === 'late_night') return false
      if (tc.timeOfDay === 'night' && tc.hour >= 0 && tc.hour < 2) return false
    }

    // 睡眠模式不打扰
    if (presence.mode === 'sleeping') return false

    // 渐进式冷却：检查当前阶段的等待时间
    const elapsed = now - this.lastProactiveMs
    if (elapsed < COOLDOWN_STAGES[this.proactiveStageIndex]) return false

    return true
  }

  /** 生成主动消息并更新阶段（仅 LLM，无模板兜底） */
  async tryGenerateProactive(
    relationship: L1State,
    emotion: EmotionState,
    opts?: { settings?: import('../../../../settings').AppSettings; recentFact?: string }
  ): Promise<{ message: string; timeContext: TimeContext } | null> {
    if (!this.shouldSendProactive()) return null
    if (!opts?.settings) {
      log.debug('proactive skipped: LLM settings unavailable')
      return null
    }

    const timeCtx = getTimeContext()
    const msg = await this.generateLLMMessage(
      relationship,
      emotion,
      timeCtx,
      opts.settings,
      opts.recentFact
    )
    if (!msg) return null

    this.lastProactiveMs = Date.now()
    this.proactiveStageIndex++
    log.info('proactive message sent', {
      msg: msg.slice(0, 60),
      stage: `${this.proactiveStageIndex}/${MAX_PROACTIVE_STAGES}`,
      mode: this._presenceMode,
      timeOfDay: timeCtx.timeOfDay
    })
    return { message: msg, timeContext: timeCtx }
  }

  /** LLM 生成主动消息（精简 prompt，~100 tokens） */
  private async generateLLMMessage(
    relationship: L1State,
    emotion: EmotionState,
    timeCtx: TimeContext,
    settings: import('../../../../settings').AppSettings,
    recentFact?: string
  ): Promise<string | null> {
    try {
      const { createLlmJsonClient } = await import('../../../../llmClient.js')
      const { buildProactivePersonalityBlock } = await import(
        '../../../../companion/proactivePersonalityContext.js'
      )
      const llm = createLlmJsonClient(settings)

      const emotionLabel = emotion.primaryLabel ?? '平静'
      const stage = relationship.stage
      const fact = recentFact ? `\n最近记忆（可轻点提到）：${recentFact}` : ''
      const topics =
        timeCtx.topicHints.length > 0
          ? `\n时段可自然聊到：${timeCtx.topicHints.join('、')}`
          : ''

      const personalityBlock = buildProactivePersonalityBlock({
        presetId: settings.personalityPresetId,
        settings,
        aff: emotion.aff,
        harass: false
      })

      const prompt = `你是 Ackem，用户的 AI 伴侣（不是底层大模型品牌）。用户暂时离开了，你要发一条 Windows 桌面通知。

${personalityBlock}

关系：${stage}（信任 ${relationship.trust}） 情绪：${emotionLabel}（好感 ${emotion.aff}）
时间：${timeCtx.greeting}${fact}${topics}

【硬性 · 通知正文】
- 写一句对用户直接说的完整短句，8～22 字，像微信随手发的成句人话。
- 必须有完整语义，句末用 。！？ 之一收尾。
- 禁止：括号、动作描写、第三人称旁白、状态描写、未完成句。
- 禁止：提到 AI/伴侣/屏幕/程序/模型；禁止客服腔；禁止「我在呢」「有需要就叫我」。
- 只输出这一句话，不要引号。`

      const result = await llm.chatCompletionJsonDetailed({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.72,
        max_tokens: 128
      })

      const cleaned = sanitizeDesktopProactiveMessage(result.text)
      if (cleaned) return cleaned
      if (result.truncated) {
        const retry = await llm.chatCompletionJsonDetailed({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.65,
          max_tokens: 128
        })
        const retryCleaned = sanitizeDesktopProactiveMessage(retry.text)
        if (retryCleaned) return retryCleaned
      }
      return templateDesktopProactiveMessage(timeCtx)
    } catch (e) {
      log.warn('LLM proactive generation failed', { error: String(e) })
      return null
    }
  }

  /** 生成静默陪伴状态文本（用于 UI 在场指示器） */
  getCompanionStatusText(): string {
    const tc = getTimeContext()
    const presence = this.getPresence()

    switch (presence.mode) {
      case 'active':
        return '在你身边'
      case 'quiet':
        return '安静地陪着你'
      case 'sleeping':
        return '睡着了…'
      default:
        return '在你身边'
    }
  }

  /** 生成桌面通知内容 */
  async getNotificationContent(
    relationship: L1State,
    emotion: EmotionState,
    opts?: { settings?: import('../../../../settings').AppSettings; recentFact?: string }
  ): Promise<{ title: string; body: string } | null> {
    const result = await this.tryGenerateProactive(relationship, emotion, opts)
    if (!result) return null

    return {
      title: 'Ackem',
      body: result.message
    }
  }

  updateConfig(patch: Partial<ProactiveMessageConfig>): void {
    this.config = { ...this.config, ...patch }
  }

  getConfig(): ProactiveMessageConfig {
    return { ...this.config }
  }
}
