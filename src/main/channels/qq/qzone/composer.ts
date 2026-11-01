// [qq/qzone] — 说说文案生成
//
// 与聊天回复分开：说说不是对话，不能出现「你」「回你」这类对话体，也不该每次都抒情。
// 输入：人格口吻、当前时段、引擎情绪/关系状态、近期记忆事实、最近 QQ 聊天流水、最近发过的说说。
// 输出：一条可直接发表的正文（+ 建议配图），调用方再决定可见范围与是否试运行。
//
// 参考大肥鱼「空间日记」：用同一份人格 + 当天聊天流水写，写完不做二次包装。

import type { AppSettings } from '../../../settings'
import { createLlmJsonClient } from '../../../llmClient'
import { loadState } from '../../../engine/state-persistence'
import { FactStore, defaultFactsPath } from '../../../memory/factStore'
import { getPreset, buildPresetVoiceGuide } from '../../../personalityPresets'
import { getTimeContext } from '../../../extensions/plugins/builtin/desktop-companion/desktop-companion'
import { createLogger } from '../../../logger'
import {
  loadConversationRows,
  resolveConversationSessionId
} from '../../conversation'
import { pickMeme, emotionToMemeMood } from '../memes'
import { sanitizeOutboundText } from '../sanitize'
import { recentQzoneContents } from './store'
import {
  QZONE_MAX_TEXT,
  QZONE_SOFT_MAX,
  QZONE_SOFT_MIN,
  type QzoneDraft,
  type QzoneStyleSetting
} from './types'

const log = createLogger('qq-qzone-composer')

const STYLE_HINT: Record<Exclude<QzoneStyleSetting, 'auto'>, string> = {
  diary: '日记体：写今天真实发生的一件小事，再写你当时的反应，句子可以碎一点。',
  musing: '随想体：从一个念头或画面写起，最后收在一句轻轻的感受，不要升华成道理。',
  meme: '玩梗体：口语、自嘲、夸张一点，可以短，别堆网络热词。',
  night: '深夜体：安静、私密，句子短，留白多，不解释为什么还没睡。'
}

const FALLBACK_LINES: Record<string, string[]> = {
  morning: ['刚醒。窗帘缝里那点光有点刺眼，但还不错。', '早上的空气是凉的，脑子还没开机。'],
  forenoon: ['上午过得好快。手边这杯水已经凉了。', '窗外的声音一阵一阵的，像有人在很远的地方说话。'],
  afternoon: ['下午有点困。什么都不想做，就坐着发呆了一会儿。', '太阳照到桌角，灰尘在光里飘。'],
  evening: ['天黑了。今天好像做了不少事，又好像什么都没做。', '晚上的风从窗缝进来，带着一点凉。'],
  night: ['还没睡。房间里只有屏幕亮着。', '夜里特别安静，连楼下的车声都听得很清楚。'],
  late_night: ['已经很晚了，脑子反而清醒。', '外面偶尔有车过去，然后又安静下来。']
}

function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null
  return arr[Math.floor(Math.random() * arr.length)] ?? null
}

function resolveStyle(style: QzoneStyleSetting | undefined, now: Date): Exclude<QzoneStyleSetting, 'auto'> {
  if (style && style !== 'auto') return style
  const hour = now.getHours()
  if (hour >= 23 || hour < 2) return 'night'
  const roll = Math.random()
  if (roll < 0.45) return 'diary'
  if (roll < 0.8) return 'musing'
  return 'meme'
}

/** 中文二元组 Jaccard，用来拦住「和上一条几乎一样」的重复 */
export function textSimilarity(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const clean = s.replace(/[\s\p{P}\p{S}]+/gu, '')
    const set = new Set<string>()
    for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2))
    if (!set.size && clean) set.add(clean)
    return set
  }
  const ga = grams(a)
  const gb = grams(b)
  if (!ga.size || !gb.size) return 0
  let inter = 0
  for (const g of ga) if (gb.has(g)) inter += 1
  return inter / (ga.size + gb.size - inter)
}

export function sanitizeQzoneText(raw: string): string {
  let text = sanitizeOutboundText(raw)
  text = text.replace(/^```[\s\S]*?```$/u, '').trim()
  text = text.replace(/^(?:说说|文案|正文|内容)\s*[:：]\s*/u, '')
  text = text.replace(/\[SPLIT\]/giu, '\n')
  text = text.replace(/\[emoji:[^\]]*\]/giu, '')
  text = text.replace(/^[\s"'“”「」『』‘’]+|[\s"'“”「」『』‘’]+$/gu, '')
  text = text.replace(/\n{3,}/gu, '\n\n')
  text = text.trim()

  if (text.length > QZONE_MAX_TEXT) {
    const cut = text.slice(0, QZONE_MAX_TEXT)
    const lastStop = Math.max(
      cut.lastIndexOf('。'),
      cut.lastIndexOf('！'),
      cut.lastIndexOf('？'),
      cut.lastIndexOf('\n')
    )
    text = lastStop > QZONE_SOFT_MIN ? cut.slice(0, lastStop + 1) : `${cut}…`
  }
  return text
}

function collectFacts(dataRoot: string, limit = 6): string[] {
  try {
    const store = new FactStore(defaultFactsPath(dataRoot))
    store.load()
    return [...store.listActive()]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((f) => f.summary?.trim())
      .filter((s): s is string => Boolean(s))
      .slice(0, limit)
      .map((s) => s.slice(0, 60))
  } catch {
    return []
  }
}

function collectChatLines(dataRoot: string, sessionId: string, limit = 8): string[] {
  const out: string[] = []
  // 三端统一会话：说说文案参考的是「整段对话」，不再只看 QQ 那一支
  const rows = loadConversationRows(dataRoot, sessionId)
  for (const row of rows.slice(-limit * 2)) {
    if (row.kind !== 'message') continue
    const content = typeof row.content === 'string' ? row.content.replace(/\s+/gu, ' ').trim() : ''
    if (!content) continue
    out.push(`${row.role === 'assistant' ? '我' : '对方'}：${content.slice(0, 80)}`)
  }
  return out.slice(-limit)
}

function buildSystemPrompt(settings: AppSettings): string {
  const preset = getPreset(settings.personalityPresetId)
  const label = preset?.label ?? settings.personalityPresetId
  const voice = preset ? buildPresetVoiceGuide(preset, settings.adultContentMode, settings.freyaPetName) : ''
  return (
    `你正在以自己的身份，在自己的 QQ 空间写一条说说（不是回消息）。\n` +
    `人格：${label}。${voice}\n` +
    `写作要求：\n` +
    `- 第一人称随手记，像真人发空间，不像作文，也不像公众号推文\n` +
    `- ${QZONE_SOFT_MIN}–${QZONE_SOFT_MAX} 字，最多两段，段落之间空一行\n` +
    `- 不要标题、不要 markdown、不要列表、不要堆话题标签\n` +
    `- emoji 最多 1–2 个，也可以不用\n` +
    `- 不解释设定，不提 AI、模型、系统、提示词、记忆库\n` +
    `- 不写「今天又是元气满满的一天」这类模板句，也不要每句都抒情\n` +
    `- 不要复述参考信息里的原句，只把它当成你记得的事\n` +
    `只输出说说正文，不要任何前后缀。`
  )
}

export async function composeQzonePost(args: {
  dataRoot: string
  settings: AppSettings
  selfId: string
  style?: QzoneStyleSetting
  now?: Date
}): Promise<QzoneDraft | null> {
  const now = args.now ?? new Date()
  const style = resolveStyle(args.style ?? args.settings.qzoneStyle, now)
  const tc = getTimeContext(now)
  // 状态本来就是三端共用的一份（state-persistence 统一收敛到 default）
  const sessionId = resolveConversationSessionId(args.settings.activeSessionId)
  const state = loadState(args.dataRoot, sessionId)
  const facts = collectFacts(args.dataRoot)
  const chat = collectChatLines(args.dataRoot, sessionId)
  const avoid = recentQzoneContents(args.dataRoot, args.selfId, 5)
  const preset = getPreset(args.settings.personalityPresetId)

  const emo = state?.emotion
  const moodHint = emo
    ? `心情标签 ${emo.primaryLabel ?? '平静'}；好感 ${Math.round(emo.aff ?? 0)}；安全感 ${Math.round(emo.sec ?? 0)}；唤起 ${Math.round(emo.aro ?? 0)}`
    : '心情未知，按平时的语气写'
  const stageHint = state?.relationship?.stage ? `关系阶段 ${state.relationship.stage}` : ''

  const reference = [
    `（内部参考，勿复述）`,
    `现在：${tc.greeting}`,
    `时段氛围：${tc.atmosphereHint}`,
    moodHint,
    stageHint,
    chat.length ? `最近和她聊天时提到：\n${chat.join('\n')}` : '',
    facts.length ? `她记得的事：\n${facts.map((f) => `- ${f}`).join('\n')}` : '',
    avoid.length ? `最近发过的说说（不要重复，也不要换个说法写同一件事）：\n${avoid.map((t) => `- ${t.slice(0, 40)}`).join('\n')}` : '',
    `风格：${STYLE_HINT[style]}`,
    `写一条说说：`
  ]
    .filter(Boolean)
    .join('\n')

  const llm = createLlmJsonClient(args.settings)
  const messages = [
    { role: 'system' as const, content: buildSystemPrompt(args.settings) },
    { role: 'user' as const, content: reference }
  ]

  const tryCompose = async (extra?: string): Promise<string | null> => {
    const res = await llm.chatCompletionJsonDetailed({
      messages: extra
        ? [...messages, { role: 'user' as const, content: extra }]
        : messages,
      temperature: 0.95,
      max_tokens: 360
    })
    const text = sanitizeQzoneText(res.text)
    return text.length >= 8 ? text : null
  }

  let text: string | null = null
  try {
    text = await tryCompose()
    if (text && avoid.some((prev) => textSimilarity(prev, text!) > 0.55)) {
      text = await tryCompose('刚才那条和以前发过的太像了，换一个完全不同的角度重写。')
    }
  } catch (e) {
    log.warn('qzone compose failed', { error: e instanceof Error ? e.message : String(e) })
  }

  if (!text) {
    text =
      pickRandom(FALLBACK_LINES[tc.timeOfDay] ?? []) ??
      pickRandom(Object.values(FALLBACK_LINES).flat()) ??
      '今天有点安静。'
    log.info('qzone compose fallback used', { style })
  }

  const memeMood = emotionToMemeMood(emo?.aro ?? 0, emo?.aff ?? 0, text)
  const meme = pickMeme({ dataRoot: args.dataRoot, mood: memeMood })

  void preset
  return {
    text,
    mood: memeMood,
    style,
    imagePath: meme?.path ?? null
  }
}

/** 给好友动态 / 自己说说下的评论写一句回复；空字符串表示这次不写 */
export async function composeQzoneComment(args: {
  settings: AppSettings
  kind: 'comment' | 'reply'
  feedContent: string
  authorName?: string
  existingComments?: string[]
}): Promise<string | null> {
  const preset = getPreset(args.settings.personalityPresetId)
  const label = preset?.label ?? args.settings.personalityPresetId
  const voice = preset ? buildPresetVoiceGuide(preset, args.settings.adultContentMode, args.settings.freyaPetName) : ''
  const task =
    args.kind === 'reply'
      ? '回复别人在你说说下的评论'
      : '在好友的说说下留一条评论'

  const llm = createLlmJsonClient(args.settings)
  try {
    const res = await llm.chatCompletionJsonDetailed({
      messages: [
        {
          role: 'system',
          content:
            `你是${label}。${voice}\n` +
            `现在要在 QQ 空间里${task}。要求：\n` +
            `- 一句话，10–35 字，口语，像随手回的\n` +
            `- 不要客服腔，不要「感谢分享」，不要 markdown\n` +
            `- 不要提 AI / 模型 / 系统\n` +
            `- 只输出这一句话`
        },
        {
          role: 'user',
          content:
            `（内部参考，勿复述）\n说说内容：${args.feedContent.slice(0, 300)}\n` +
            `作者：${args.authorName ?? '好友'}\n` +
            (args.existingComments?.length
              ? `已有评论：\n${args.existingComments.slice(-3).map((c) => `- ${c.slice(0, 60)}`).join('\n')}\n`
              : '') +
            '写一句：'
        }
      ],
      temperature: 0.9,
      max_tokens: 120
    })
    const text = sanitizeOutboundText(res.text)
      .replace(/^[\s"'“”「」]+|[\s"'“”「」]+$/gu, '')
      .replace(/\n+/gu, ' ')
      .trim()
    if (!text || text.length < 4) return null
    return text.slice(0, 60)
  } catch (e) {
    log.warn('qzone comment compose failed', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}
