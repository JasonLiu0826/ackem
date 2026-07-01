import {
  detectBareFeatureCreateCandidate,
  detectExtensionDemandExplicit,
  extractBareFeatureCreateTopic
} from '../dispatch/explicitDispatch'
import {
  isCasualOpinionChat,
  wantsOrganizeAsCard
} from '../plugins/builtin/knowledge-presentation/intent'
import { cosineSimilarity } from '../../memory/factEmbeddingCache'

/** @deprecated 兼容旧测试名；请用 shouldRunCapabilityProbe */
export type ExtensionIntentClass =
  | 'extension_demand'
  | 'relationship_emotional'
  | 'capability_query'
  | 'chit_chat'
  | 'extension_update'
  | 'content_organize'

export type CapabilityPersistency = 'recurring' | 'one_shot' | 'relational' | 'none'

/** Jarvis 式能力探针：评估「缺口是否值得做成可部署 Skill」 */
export type CapabilityProbe = {
  capability_gap: number
  implementable_as_skill: number
  persistency: CapabilityPersistency
  suggested_capability?: string
  suggested_name?: string
  should_propose_plan: boolean
  reasoning?: string
}

export type ExtensionIntentClassification = {
  category: ExtensionIntentClass
  confidence: number
  suggested_name?: string
  reasoning?: string
  probe?: CapabilityProbe
}

const MIN_PROBE_LEN = 8

/** 用户表达流程摩擦 / 能力缺口（不写具体功能实体） */
const CAPABILITY_GAP_SIGNALS: RegExp[] = [
  /(?:要是|如果|真希望|希望|何时|什么时候).{0,24}(?:就好了|该多好)/,
  /(?:要是能|要是可以|如果能|能不能自动|能不能帮我)/,
  /(?:能不能有个|还缺|缺少|没(?:有)?(?:合适)?的(?:工具|办法|功能|能力))/,
  /(?:总是|老是|每次|天天).{0,16}(?:烦|麻烦|忘|重复|手动|折腾)/,
  /(?:好烦|太麻烦|费劲|费时间|重复劳动|一遍遍)/,
  /(?:提醒我|通知我|帮我记|自动(?:化)?处理)/
]

const IMPLICIT_PLAN_THRESHOLD = 0.72
const GAP_MIN = 0.62
const IMPLEMENTABLE_MIN = 0.68

/** 解析失败降级时排除：抽象情感/陪伴诉求（不用具体人物实体词） */
const PARSE_FAIL_RELATIONAL_RE = /(?:陪(?:我|你)|孤独|寂寞|脱单|恋爱|好孤单)/u

function isCapabilityMetaQuery(message: string): boolean {
  return (
    /(?:Ackem|你|这边|系统).{0,12}(?:能不能|可不可以|有没有|支持)/u.test(message) &&
    !/(?:要是|烦|麻烦|忘|自动|缺|折腾)/u.test(message)
  )
}

/** 快路径排除：已知走其它管线，不必调 LLM */
export function shouldSkipCapabilityProbe(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed.length < MIN_PROBE_LEN) return true
  if (detectExtensionDemandExplicit(trimmed)) return true
  if (wantsOrganizeAsCard(trimmed)) return true
  if (isCasualOpinionChat(trimmed)) return true
  if (isCapabilityMetaQuery(trimmed)) return true
  return false
}

/** 是否值得启动能力探针（宽进：裸功能名 create 或摩擦/缺口信号；严出：LLM 多维评分） */
export function shouldRunCapabilityProbe(
  message: string,
  queryEmbed?: number[],
  createToolAnchor?: number[]
): boolean {
  const trimmed = message.trim()
  if (detectBareFeatureCreateCandidate(trimmed)) return true
  if (shouldSkipCapabilityProbe(message)) return false
  if (CAPABILITY_GAP_SIGNALS.some((re) => re.test(trimmed))) return true

  // Embedding 兜底：语义匹配"想造工具"意图
  if (queryEmbed && createToolAnchor && queryEmbed.length > 0 && createToolAnchor.length > 0) {
    if (cosineSimilarity(queryEmbed, createToolAnchor) > 0.70) return true
  }

  return false
}

export function buildCapabilityProbePrompt(userMessage: string, recentContext: string): string {
  return [
    '你是 Ackem 的 capability probe（类似 Jarvis 评估用户是否缺一个「可部署、可重复调用」的自动化能力）。',
    'Companion 本体已负责：对话、情感陪伴、记忆、一次性知识整理纸面卡、调度已有 Skill。',
    '只有「反复出现、可用代码/规则/触发器封装」的缺口，才建议进入 Plan 开发新 Skill/插件。',
    '只返回 JSON，不要 markdown。',
    '',
    '评估步骤（在 reasoning 里用一句话体现）：',
    '1) 是否存在能力/流程缺口（capability_gap）',
    '2) 缺口能否用 Skill/插件实现，而非靠聊天或真人关系满足（implementable_as_skill）',
    '3) 需求是反复发生(recurring)、一次性(one_shot)、关系/情感(relational)、还是无(none)',
    '',
    '字段：',
    '{',
    '  "capability_gap": number,          // 0~1',
    '  "implementable_as_skill": number,  // 0~1；纯陪伴/情感/人际 → 接近 0',
    '  "persistency": "recurring"|"one_shot"|"relational"|"none",',
    '  "suggested_capability": string,    // 一句话，抽象描述缺口，来自用户原话',
    '  "suggested_name": string,          // 2~8 字能力名；仅 recurring 且 implementable 高时填写',
    '  "should_propose_plan": boolean,    // 综合建议是否反问用户做 Skill',
    '  "reasoning": string',
    '}',
    '',
    '原则：宁可漏判，不要误判。情感/陪伴/孤独 → relational。整理/写一份/总结 → one_shot。',
    recentContext ? `最近对话：\n${recentContext.slice(0, 400)}` : '',
    `用户消息："${userMessage}"`
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseCapabilityProbe(raw: string): CapabilityProbe | null {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as CapabilityProbe
    if (typeof parsed.capability_gap !== 'number' || typeof parsed.implementable_as_skill !== 'number') {
      return null
    }
    const persistency = parsed.persistency
    if (!['recurring', 'one_shot', 'relational', 'none'].includes(persistency)) return null
    return {
      capability_gap: clamp01(parsed.capability_gap),
      implementable_as_skill: clamp01(parsed.implementable_as_skill),
      persistency,
      suggested_capability: parsed.suggested_capability?.trim() || undefined,
      suggested_name: parsed.suggested_name?.trim() || undefined,
      should_propose_plan: Boolean(parsed.should_propose_plan),
      reasoning: parsed.reasoning
    }
  } catch {
    return null
  }
}

/** @deprecated 兼容旧 category JSON；新路径请用 parseCapabilityProbe */
export function parseIntentClassification(raw: string): ExtensionIntentClassification | null {
  const probe = parseCapabilityProbe(raw)
  if (probe) return evaluateProbeForPlan(probe) ?? probeToNegativeClassification(probe)

  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < 0) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as ExtensionIntentClassification
    if (!parsed.category || typeof parsed.confidence !== 'number') return null
    return {
      category: parsed.category,
      confidence: clamp01(parsed.confidence),
      suggested_name: parsed.suggested_name?.trim() || undefined,
      reasoning: parsed.reasoning
    }
  } catch {
    return null
  }
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export function compositeProbeConfidence(probe: CapabilityProbe): number {
  if (probe.persistency === 'relational' || probe.persistency === 'one_shot') {
    return clamp01(Math.min(probe.capability_gap, probe.implementable_as_skill) * 0.45)
  }
  if (probe.persistency === 'none') {
    return clamp01(probe.capability_gap * 0.35)
  }
  return clamp01(probe.capability_gap * 0.42 + probe.implementable_as_skill * 0.58)
}

function probeToNegativeClassification(probe: CapabilityProbe): ExtensionIntentClassification {
  const category: ExtensionIntentClass =
    probe.persistency === 'relational'
      ? 'relationship_emotional'
      : probe.persistency === 'one_shot'
        ? 'content_organize'
        : probe.persistency === 'none'
          ? 'chit_chat'
          : 'capability_query'
  return {
    category,
    confidence: compositeProbeConfidence(probe),
    reasoning: probe.reasoning,
    probe
  }
}

/** 严出：多维门槛 + LLM 综合 flag */
export function shouldProposePlanFromProbe(probe: CapabilityProbe): boolean {
  if (probe.persistency !== 'recurring') return false
  if (probe.capability_gap < GAP_MIN) return false
  if (probe.implementable_as_skill < IMPLEMENTABLE_MIN) return false
  const confidence = compositeProbeConfidence(probe)
  if (confidence < IMPLICIT_PLAN_THRESHOLD) return false
  if (!probe.should_propose_plan && confidence < 0.82) return false
  return true
}

export function evaluateProbeForPlan(probe: CapabilityProbe): ExtensionIntentClassification | null {
  if (!shouldProposePlanFromProbe(probe)) return null
  return {
    category: 'extension_demand',
    confidence: compositeProbeConfidence(probe),
    suggested_name: probe.suggested_name,
    reasoning: probe.reasoning,
    probe
  }
}

export function buildPlanAskMessage(classification: ExtensionIntentClassification): string {
  const name = classification.suggested_name?.trim()
  const capability = classification.probe?.suggested_capability?.trim()
  if (name) {
    return `听起来你缺一个「${name}」能力——要不要我帮你做成 Skill 或插件？`
  }
  if (capability) {
    return `听起来你需要：${capability}——要不要我帮你做成 Skill 或插件？`
  }
  return '听起来你需要一个可重复用的小能力——要不要我帮你做成 Skill 或插件？'
}

export async function runCapabilityProbe(
  userMessage: string,
  recentContext: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<CapabilityProbe | null> {
  try {
    const raw = await llmCall(buildCapabilityProbePrompt(userMessage, recentContext))
    return parseCapabilityProbe(raw)
  } catch {
    return null
  }
}

/** 从隐式缺口句式抽取能力描述（不写死功能实体词表） */
export function extractImplicitCapabilityHint(message: string): string | undefined {
  const trimmed = message.trim()

  const wish = trimmed.match(/(?:要是|如果|真希望|希望)(.+?)(?:就好了|该多好)/u)
  if (wish?.[1]) {
    const hint = sanitizeCapabilityHint(wish[1])
    if (hint.length >= 2) return hint
  }

  const friction = trimmed.match(
    /(?:总是|老是|每次|天天).{0,20}(?:要|得)?(.{2,20}?)(?:，|,|。|$|太|好)(?:烦|麻烦|忘|重复|手动|折腾)/u
  )
  if (friction?.[1]) {
    const hint = sanitizeCapabilityHint(friction[1])
    if (hint.length >= 2) return hint
  }

  const bare = extractBareFeatureCreateTopic(trimmed)
  if (bare) return bare

  return undefined
}

function sanitizeCapabilityHint(raw: string): string {
  return raw
    .replace(/^(?:能|可以)?(?:有)?(?:个|一个)?/u, '')
    .replace(/[。「」""''\s，,]+$/gu, '')
    .trim()
}

function shortenCapabilityName(hint: string): string {
  const s = hint.replace(/^(帮我|给我|自己|自动)/u, '').trim()
  return (s.length >= 2 ? s : hint).slice(0, 8)
}

/**
 * LLM 探针 JSON 解析失败时的降级（仅结构信号 + 句式抽取，不用功能实体词表）。
 * 情感/陪伴类缺口仍优先由 LLM 的 persistency=relational 拦截；此处只做解析兜底。
 */
export function buildParseFailureCapabilityProbe(userMessage: string): CapabilityProbe | null {
  const trimmed = userMessage.trim()
  if (!shouldRunCapabilityProbe(trimmed)) return null

  const hint = extractImplicitCapabilityHint(trimmed)
  if (!hint) return null
  if (PARSE_FAIL_RELATIONAL_RE.test(hint)) return null

  return {
    capability_gap: 0.76,
    implementable_as_skill: 0.78,
    persistency: 'recurring',
    suggested_capability: trimmed.slice(0, 48),
    suggested_name: shortenCapabilityName(hint),
    should_propose_plan: true,
    reasoning: 'parse_failure_fallback:structural_hint'
  }
}

/** LLM 已返回 JSON 但未过 composite 门槛时，若模型明确 flag 且维度达标则仍 propose */
function evaluateProbeWithLlmFlag(probe: CapabilityProbe): ExtensionIntentClassification | null {
  if (probe.persistency !== 'recurring') return null
  if (!probe.should_propose_plan) return null
  if (probe.capability_gap < GAP_MIN || probe.implementable_as_skill < IMPLEMENTABLE_MIN) return null
  return {
    category: 'extension_demand',
    confidence: compositeProbeConfidence(probe),
    suggested_name: probe.suggested_name,
    reasoning: probe.reasoning,
    probe
  }
}

export async function classifyExtensionIntent(
  userMessage: string,
  recentContext: string,
  llmCall: (prompt: string) => Promise<string>
): Promise<ExtensionIntentClassification | null> {
  const probe = await runCapabilityProbe(userMessage, recentContext, llmCall)

  if (probe) {
    const plan = evaluateProbeForPlan(probe)
    if (plan) return plan

    const planFromFlag = evaluateProbeWithLlmFlag(probe)
    if (planFromFlag) return planFromFlag

    if (probe.persistency === 'relational' || probe.persistency === 'one_shot') {
      return probeToNegativeClassification(probe)
    }
  }

  // 仅 JSON 解析失败：句式抽取兜底（不用功能实体词表）
  if (!probe) {
    const fallback = buildParseFailureCapabilityProbe(userMessage)
    if (fallback) {
      const plan = evaluateProbeForPlan(fallback)
      if (plan) return plan
    }
    return null
  }

  return probeToNegativeClassification(probe)
}
