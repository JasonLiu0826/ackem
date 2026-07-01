import type { DispatchCatalogEntry } from '../protocols'
import { messageMatchesKeywords } from './candidateCollector'
import { wantsOrganizeAsCard } from '../plugins/builtin/knowledge-presentation/intent'

/** 用户明确要「做一个扩展制品」，而非一次性代劳 */
const CREATE_VERB =
  '(?:帮我|给我|帮帮我)(?:来)?(?:做|写|创建|做一个|写个|弄个|做个|开发|设计|生成|整(?:个|一个)?)'

/** 整段前缀须包在同一非捕获组内，否则 `\s*` 只会挂在 `/create` 分支上 */
const CREATE_TOPIC_PREFIX = `(?:${CREATE_VERB}|(?:(?:能不能|可不可以|可以)(?:做|写|创建))|(?:\\/create))`

const CREATE_DEMAND_RE = new RegExp(
  `(?:${CREATE_VERB}|(?:(?:能不能|可不可以|可以)(?:做|写|创建|帮我做))|(?:\\/create\\b))`,
  'i'
)

/** 扩展制品类型词（只描述产物形态，不写具体功能实体如番茄钟/计时） */
const EXTENSION_META_RE =
  /\b(skill|uskill|uplugin)\b|技能|插件|扩展(?:模块|能力)?|小工具|自动化(?:能力|工具)?|[\u4e00-\u9fff]{2,12}器/iu

/** 话题后可跟一句动机/补充说明（如「，我要卧薪尝胆」） */
const CREATE_TOPIC_TAIL = String.raw`(?:[，,][^，。！？\n]{0,48})?`

/** 一次性内容/文档任务，不是「做一个可复用扩展」 */
const EPHEMERAL_CONTENT_RE =
  /帮我(?:写|改|润色|编辑|翻译)|(?:写|撰写|起草)(?:一份|一个|篇)?(?:周报|报告|邮件|文案|作文|总结|心得)|改一下|润色/

/**
 * 与 L0.5 知识整理、一次性写作互斥。
 * 「帮我整理一下 React」→ 纸面卡；「帮我做一个整理笔记的 Skill」→ 仍可为扩展创建。
 */
export function isExtensionCreateExcluded(message: string): boolean {
  const trimmed = message.trim()
  if (!trimmed) return true
  if (wantsOrganizeAsCard(trimmed)) return true
  if (EPHEMERAL_CONTENT_RE.test(trimmed) && !EXTENSION_META_RE.test(trimmed)) return true
  return false
}

export function detectExtensionDemandExplicit(message: string): boolean {
  const trimmed = message.trim()
  if (!CREATE_DEMAND_RE.test(trimmed)) return false
  if (!EXTENSION_META_RE.test(trimmed)) return false
  if (isExtensionCreateExcluded(trimmed)) return false
  return true
}

/**
 * 无制品词但明显在「做一个功能/工具」：走隐式 Capability Probe → ask_plan。
 * 「帮我做一个番茄钟」≈「帮我做一个番茄钟 Skill」，由 Ackem 反问确认。
 */
export function detectBareFeatureCreateCandidate(message: string): boolean {
  const trimmed = message.trim()
  if (!CREATE_DEMAND_RE.test(trimmed)) return false
  if (EXTENSION_META_RE.test(trimmed)) return false
  if (isExtensionCreateExcluded(trimmed)) return false
  return extractBareFeatureCreateTopic(trimmed) !== undefined
}

/** 从「帮我做/做一个 XXX」（无 Skill/插件后缀）提取功能名 */
export function extractBareFeatureCreateTopic(message: string): string | undefined {
  const trimmed = message.trim()
  const m = trimmed.match(
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:一个|个)?[「"']?([^「」"'，。！？\\n]{2,16}?)\\s*[。！？!?]?${CREATE_TOPIC_TAIL}$`,
      'iu'
    )
  )
  if (!m?.[1]) return undefined
  const topic = m[1].replace(/[「」"'"]/g, '').trim()
  if (topic.length >= 2 && topic.length <= 16) return topic
  return undefined
}

/** 从显式 create 话术提取工作区名称（如「帮我做一个 XXX Skill」→ XXX） */
export function extractExplicitCreateTopic(message: string): string | undefined {
  const trimmed = message.trim()
  const patterns = [
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:一个|个)?[「"']?([^「」"'，。！？\\n]{2,16}?)\\s*(?:skill|技能|插件|扩展(?:模块|能力)?|小工具|自动化)`,
      'iu'
    ),
    new RegExp(
      `${CREATE_TOPIC_PREFIX}\\s*(?:一个|个)?[「"']?([\\u4e00-\\u9fff]{2,14}器)\\s*[。！？!?]?${CREATE_TOPIC_TAIL}$`,
      'iu'
    ),
    /\/create\s+(.{2,16})/i
  ]
  for (const re of patterns) {
    const m = trimmed.match(re)
    if (!m?.[1]) continue
    const topic = m[1]
      .replace(/[「」"'"]/g, '')
      .trim()
    if (topic.length >= 2 && topic.length <= 16) return topic
  }
  return undefined
}

const INVOKE_PREFIX_RE = /^(打开|启动|开始|运行|启用|使用|调用|搜索|搜一下|查一下)/

export function matchExplicitInvoke(
  message: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry | undefined {
  const trimmed = message.trim()
  if (!INVOKE_PREFIX_RE.test(trimmed) && !messageMatchesKeywords(trimmed, ['搜索', '搜一下', '查一下'])) {
    return undefined
  }

  for (const entry of catalog) {
    if (entry.status !== 'active') continue
    if (entry.rejectedInSession) continue

    const habitHits = entry.dispatch.habits.some((habit) => {
      const tokens = habit.match(/['「]([^'」]+)['」]/g)
      if (tokens) {
        return tokens.some((t) => trimmed.includes(t.replace(/['「」]/g, '')))
      }
      return trimmed.includes(habit.slice(0, Math.min(8, habit.length)))
    })

    if (habitHits) return entry
    if (messageMatchesKeywords(trimmed, entry.dispatch.keywords)) return entry
  }

  return undefined
}
