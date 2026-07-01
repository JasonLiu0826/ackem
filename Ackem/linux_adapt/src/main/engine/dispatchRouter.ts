import { PERSONALITY_PRESETS } from '../personalityPresets'
import type { DispatchCatalogEntry, DispatchResult } from '../extensions/protocols'
import {
  collectDispatchCandidates,
  collectSemanticDispatchCandidates,
  mergeDispatchCandidates
} from '../extensions/dispatch/candidateCollector'
import {
  detectExtensionDemandExplicit,
  extractBareFeatureCreateTopic,
  extractExplicitCreateTopic,
  matchExplicitInvoke
} from '../extensions/dispatch/explicitDispatch'
import {
  matchEvolveExtension,
  matchExplicitOpenSurface
} from '../extensions/dispatch/explicitEvolve'
import { upluginHasSurface, readUpluginSurfaceConfig } from '../extensions/openforu/surface/surfaceMeta'
import { buildSurfaceInvokeMeta } from '../../shared/surfaceInvoke'
import { matchSlashInvoke } from '../extensions/dispatch/slashDispatch'
import {
  buildPlanAskMessage,
  classifyExtensionIntent,
  shouldRunCapabilityProbe
} from '../extensions/openforu/extensionIntentClassifier'
import {
  getLastTriggeredAt,
  isRejectedInSession,
  recordDispatchTrigger
} from '../extensions/dispatch/dispatchSession'
import {
  getDispatchedConfidenceDelta,
  shouldForceAutoInvoke
} from '../extensions/policy/userProfile'
import type { TurnPlan } from '../../shared/turnPlan'

function trySurfaceInvokeDispatch(
  dataRoot: string | undefined,
  entry: DispatchCatalogEntry,
  trigger: 'slash' | 'keyword',
  reasoning: string,
  confidence = 1
): DispatchResult | null {
  if (!dataRoot || !upluginHasSurface(dataRoot, entry.id)) return null
  const surface = readUpluginSurfaceConfig(dataRoot, entry.id)
  const surfaceInvoke = buildSurfaceInvokeMeta(surface, trigger)
  if (!surfaceInvoke) return null
  return {
    decision: 'invoke_surface',
    extensionId: entry.id,
    confidence,
    reasoning,
    surfaceInvoke
  }
}

const AUTO_THRESHOLD = 0.85
const ASK_THRESHOLD = 0.60

const PERSONALITY_MOD: Record<string, number> = {
  deredere: 1.15,
  tsundere: 0.90,
  kuudere: 1.25,
  genki: 0.85
}

export interface LlmDispatchMatch {
  matched: boolean
  extension_id?: string
  confidence?: number
  reasoning?: string
}

export interface RouteDispatchInput {
  userMessage: string
  sessionId: string
  catalog: DispatchCatalogEntry[]
  now?: Date
  personalityPresetId?: string
  recentContext?: string
  emotionLabel?: string
  retrievedMemoryBlock?: string
  /** CTX-A 场景 hint，供 LLM 判断是否误触发 */
  activityHint?: string
  dataRoot?: string
  llmCall?: (prompt: string) => Promise<string>
  /** 贾维斯 TurnPlan：扩展候选召回 + 结构化交付提示 */
  turnPlan?: TurnPlan
  /** Embedding 路由：用户消息 Embedding 向量 */
  queryEmbed?: number[]
  /** Embedding 路由：路由索引 */
  routeIndex?: import('../embedding/types').RouteIndex
  /** OpenForU 能力探测：创建工具锚定中心向量 */
  createToolAnchor?: number[]
  /** 消解后的消息，用于关键词/语义/embedding 匹配（不用于 slash/explicit/capability） */
  matchMessage?: string
}

function enrichCatalog(
  sessionId: string,
  catalog: DispatchCatalogEntry[]
): DispatchCatalogEntry[] {
  return catalog.map((entry) => ({
    ...entry,
    lastTriggeredAt: getLastTriggeredAt(sessionId, entry.id) ?? entry.lastTriggeredAt,
    rejectedInSession: isRejectedInSession(sessionId, entry.id)
  }))
}

function personalityMultiplier(presetId?: string): number {
  if (!presetId) return 1
  const preset = PERSONALITY_PRESETS.find((p) => p.id === presetId)
  if (!preset?.tags?.length) return 1
  for (const tag of preset.tags) {
    const mod = PERSONALITY_MOD[tag]
    if (mod) return mod
  }
  return 1
}

function applyThreshold(confidence: number, multiplier: number): DispatchResult['decision'] {
  const adjusted = Math.min(1, confidence * multiplier)
  if (adjusted >= AUTO_THRESHOLD) return 'auto_invoke'
  if (adjusted >= ASK_THRESHOLD) return 'ask_invoke'
  return 'silent'
}

function buildAskMessage(entry: DispatchCatalogEntry): string {
  return `要不要我帮你用「${entry.name}」？${entry.dispatch.summary}`
}

function buildLlmPrompt(
  userMessage: string,
  candidates: DispatchCatalogEntry[],
  recentContext: string,
  emotionLabel: string,
  memoryBlock: string,
  activityHint: string,
  now: Date
): string {
  const candidateLines = candidates
    .map(
      (c) =>
        `- ID: ${c.id}\n  功能：${c.dispatch.summary}\n  适用场景：${c.dispatch.scenarios.join('；')}\n  用户习惯：${c.dispatch.habits.join('；')}`
    )
    .join('\n')

  return [
    '你是一个扩展调度判断器。根据用户消息和上下文，判断是否应该触发以下扩展。',
    '宁可漏掉，不要误触发。只返回 JSON。',
    '',
    `时间：${now.toISOString()}`,
    `情绪：${emotionLabel}`,
    recentContext ? `最近对话摘要：${recentContext}` : '',
    activityHint ? `用户场景：${activityHint}` : '',
    memoryBlock ? `相关记忆：${memoryBlock.slice(0, 1200)}` : '',
    '',
    '候选扩展：',
    candidateLines,
    '',
    `用户消息："${userMessage}"`,
    '',
    '返回 JSON：{ "matched": boolean, "extension_id"?: string, "confidence"?: number, "reasoning"?: string }'
  ]
    .filter(Boolean)
    .join('\n')
}

function parseLlmMatch(raw: string): LlmDispatchMatch {
  const trimmed = raw.trim()
  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < 0) return { matched: false }
  try {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as LlmDispatchMatch
  } catch {
    return { matched: false }
  }
}

export async function routeDispatch(input: RouteDispatchInput): Promise<DispatchResult> {
  const now = input.now ?? new Date()
  const catalog = enrichCatalog(input.sessionId, input.catalog)

  if (detectExtensionDemandExplicit(input.userMessage)) {
    return {
      decision: 'plan',
      planTopic: extractExplicitCreateTopic(input.userMessage),
      reasoning: 'extension_demand_explicit'
    }
  }

  if (shouldRunCapabilityProbe(input.userMessage, input.queryEmbed, input.createToolAnchor)) {
    if (!input.llmCall) {
      return { decision: 'chat', reasoning: 'capability_probe_no_llm' }
    }
    const recentContext = (input.recentContext ?? '').slice(0, 400)
    const classification = await classifyExtensionIntent(
      input.userMessage,
      recentContext,
      input.llmCall
    )
    if (classification?.category === 'extension_demand') {
      return {
        decision: 'ask_plan',
        askMessage: buildPlanAskMessage(classification),
        planTopic:
          classification.suggested_name ?? extractBareFeatureCreateTopic(input.userMessage),
        confidence: classification.confidence,
        reasoning: classification.reasoning ?? 'capability_probe_recurring'
      }
    }
    return {
      decision: 'chat',
      reasoning: classification?.category ?? 'capability_probe_rejected'
    }
  }

  const slash = matchSlashInvoke(input.userMessage, catalog)
  if (slash) {
    recordDispatchTrigger(input.sessionId, slash.id)
    const surfaceDispatch = trySurfaceInvokeDispatch(
      input.dataRoot,
      slash,
      'slash',
      'extension_invoke_slash_surface'
    )
    if (surfaceDispatch) return surfaceDispatch
    return {
      decision: 'auto_invoke',
      extensionId: slash.id,
      confidence: 1,
      reasoning: 'extension_invoke_slash'
    }
  }

  const evolveTarget = matchEvolveExtension(input.userMessage, catalog)
  if (evolveTarget) {
    return {
      decision: 'evolve',
      extensionId: evolveTarget.id,
      confidence: 1,
      reasoning: 'extension_evolve_explicit'
    }
  }

  if (input.dataRoot) {
    const surfaceTarget = matchExplicitOpenSurface(input.userMessage, catalog, (id) =>
      upluginHasSurface(input.dataRoot!, id)
    )
    if (surfaceTarget) {
      return {
        decision: 'open_surface',
        extensionId: surfaceTarget.id,
        confidence: 1,
        reasoning: 'extension_open_surface'
      }
    }
  }

  const explicit = matchExplicitInvoke(input.userMessage, catalog)
  if (explicit) {
    recordDispatchTrigger(input.sessionId, explicit.id)
    const surfaceDispatch = trySurfaceInvokeDispatch(
      input.dataRoot,
      explicit,
      'keyword',
      'extension_invoke_explicit_surface'
    )
    if (surfaceDispatch) return surfaceDispatch
    return {
      decision: 'auto_invoke',
      extensionId: explicit.id,
      confidence: 1,
      reasoning: 'extension_invoke_explicit'
    }
  }

  const matchMsg = input.matchMessage ?? input.userMessage
  const keywordHits = collectDispatchCandidates(matchMsg, catalog, now)
  const semanticHits = collectSemanticDispatchCandidates(matchMsg, catalog, now)

  // Embedding 路由匹配（新增）：用 queryEmbed 匹配路由表
  let embeddingCandidates: DispatchCatalogEntry[] = []
  if (input.queryEmbed && input.routeIndex) {
    const { collectEmbeddingCandidates } = await import('../extensions/dispatch/candidateCollector')
    embeddingCandidates = collectEmbeddingCandidates(
      input.queryEmbed, input.routeIndex, catalog, now
    )
  }

  const candidates = mergeDispatchCandidates(
    keywordHits,
    semanticHits,
    input.turnPlan?.extensionId,
    catalog
  )
  // 把 Embedding 候选合并进去
  for (const ec of embeddingCandidates) {
    const exists = candidates.some(c => c.id === ec.id)
    if (!exists) candidates.push(ec)
  }
  if (candidates.length === 0) {
    return { decision: 'chat', reasoning: 'no_candidates' }
  }

  if (!input.llmCall) {
    return { decision: 'chat', reasoning: 'no_llm_call' }
  }

  const prompt = buildLlmPrompt(
    input.userMessage,
    candidates,
    input.recentContext ?? '',
    input.emotionLabel ?? 'neutral',
    input.retrievedMemoryBlock ?? '',
    input.activityHint ?? '',
    now
  )

  let match: LlmDispatchMatch
  try {
    const raw = await input.llmCall(prompt)
    match = parseLlmMatch(raw)
  } catch {
    return { decision: 'chat', reasoning: 'llm_error' }
  }

  if (!match.matched || !match.extension_id) {
    return { decision: 'silent', reasoning: match.reasoning ?? 'llm_no_match' }
  }

  const entry = candidates.find((c) => c.id === match.extension_id)
  if (!entry) {
    return { decision: 'silent', reasoning: 'unknown_extension_id' }
  }

  let confidence = match.confidence ?? 0
  const rejectedInSession = entry.rejectedInSession ?? false
  if (input.dataRoot) {
    confidence = Math.min(
      1,
      Math.max(
        0,
        confidence +
          getDispatchedConfidenceDelta(input.dataRoot, entry.id, rejectedInSession, now.getTime())
      )
    )
  }

  if (input.dataRoot && shouldForceAutoInvoke(input.dataRoot, entry.id)) {
    recordDispatchTrigger(input.sessionId, entry.id)
    const surfaceDispatch = trySurfaceInvokeDispatch(
      input.dataRoot,
      entry,
      'keyword',
      (match.reasoning ?? '') + ';user_preference_allow_surface',
      Math.max(confidence, AUTO_THRESHOLD)
    )
    if (surfaceDispatch) return surfaceDispatch
    return {
      decision: 'auto_invoke',
      extensionId: entry.id,
      confidence: Math.max(confidence, AUTO_THRESHOLD),
      contextInjection: `【扩展调度】已触发 ${entry.name}：${entry.dispatch.summary}`,
      reasoning: (match.reasoning ?? '') + ';user_preference_allow'
    }
  }

  const decision = applyThreshold(confidence, personalityMultiplier(input.personalityPresetId))

  if (decision === 'silent') {
    return { decision: 'silent', extensionId: entry.id, confidence, reasoning: match.reasoning }
  }

  if (decision === 'ask_invoke') {
    return {
      decision: 'ask_invoke',
      extensionId: entry.id,
      confidence,
      askMessage: buildAskMessage(entry),
      reasoning: match.reasoning
    }
  }

  recordDispatchTrigger(input.sessionId, entry.id)
  const surfaceDispatch = trySurfaceInvokeDispatch(
    input.dataRoot,
    entry,
    'keyword',
    (match.reasoning ?? '') + ';llm_auto_invoke_surface',
    confidence
  )
  if (surfaceDispatch) return surfaceDispatch
  return {
    decision: 'auto_invoke',
    extensionId: entry.id,
    confidence,
    contextInjection: `【扩展调度】已触发 ${entry.name}：${entry.dispatch.summary}`,
    reasoning: match.reasoning
  }
}
