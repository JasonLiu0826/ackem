import type { ChannelPlan } from '../../shared/channelPlan'
import type { IntentJson } from '../../shared/intentProtocol'
import type { CatalogEntry } from './catalogTypes'
import { FILE_TAG, RESIDENT_TAGS, SEARCH_TAG, isOfficialBackupEntry } from './catalogTypes'
import { hasLocalWorkSignal, isOfficialBackupUtterance, extractCwdHint } from './detectMotive'
import type { CatalogMatch } from './matchCatalog'
import { inferUseTag } from './matchCatalog'
import { namesOverlap } from './deriveDeterministic'
import { chatPlan, pendingPlan, pluginPlan } from './plans'
import { extractResidualSlots } from './residualSlots'

export function normalizeChannel(
  json: IntentJson | null,
  catalog: CatalogEntry[],
  context: { userText: string; match?: CatalogMatch | null }
): ChannelPlan {
  const text = context.userText
  const match = context.match ?? { level: 'none' as const }

  if (isOfficialBackupUtterance(text)) {
    const backup = catalog.find(isOfficialBackupEntry)
    if (backup) return pluginPlan(backup.id, FILE_TAG)
  }

  if (hasLocalWorkSignal(text)) {
    return pendingPlan('work_job', {
      intent: 'work',
      workKind: 'job',
      cwd: extractCwdHint(text),
      tag: 'file'
    })
  }

  if (!json) return chatPlan('chat')

  // ── 残差 v2 (设计 §8.1/§8.3, 阶段 3-1): 建议字段接入硬改 ──
  // 低置信歧义 → 澄清 chat (不出卡不派活); candidate_hint 只作候选卡首位
  // 提名 (confidence ≥ 0.75 且清单存在), 永不给高分。
  const LOW_CONFIDENCE = 0.75
  const lowConfidenceAmbiguous =
    typeof json.confidence === 'number' &&
    json.confidence < LOW_CONFIDENCE &&
    Boolean(json.ambiguous_with) &&
    Boolean(json.clarify_question)

  if (json.intent === 'create' || json.intent === 'update') {
    // 低置信 create/update 歧义 → 澄清问句 (确定性 chat)。
    if (lowConfidenceAmbiguous && json.clarify_question) {
      return chatPlan('chat', {
        tag: json.tag,
        grounding: `【本轮通道】chat\n【状态】意图不明确，需要向用户澄清。\n【禁止】不得替用户选择，只提出澄清问题：${json.clarify_question.slice(0, 30)}`,
        params: extractResidualSlots(text, json)
      })
    }
    const tag = json.tag
    const existing = catalog.filter((e) => e.isUserPlugin && e.capabilityTag && e.capabilityTag === tag)
    const topic = json.summary || text
    const bound =
      existing.length === 1 && (json.intent === 'update' || namesOverlap(topic, existing[0].name))
        ? existing[0]
        : json.intent === 'update'
          ? existing[0]
          : undefined
    const slots = extractResidualSlots(text, json)
    if (bound) {
      return pendingPlan('update', {
        intent: 'update',
        workKind: 'factory',
        extensionId: bound.id,
        tag,
        params: slots
      })
    }
    return pendingPlan('create', { intent: 'create', workKind: 'factory', tag, params: slots })
  }

  if (json.intent === 'work' || json.tag === FILE_TAG) {
    const slots = extractResidualSlots(text, json)
    return pendingPlan('work_job', {
      intent: 'work',
      workKind: 'job',
      cwd: extractCwdHint(text) ?? (typeof slots.cwd === 'string' ? slots.cwd : undefined),
      tag: json.tag,
      params: slots
    })
  }

  if (json.intent === 'use') {
    const slots = extractResidualSlots(text, json)
    if (match.level === 'high') {
      return { ...pluginPlan(match.extensionId, json.tag ?? inferUseTag(text)), params: slots }
    }
    if (match.level === 'medium') {
      return pendingPlan('plugin_ask', {
        intent: 'use',
        tag: json.tag,
        candidateExtensionIds: match.extensionIds,
        params: slots
      })
    }
    // 残差 v2 提名 (设计 §8.1): 高置信 candidate_hint → 候选卡首位, 不给高分。
    const hint = json.candidate_hint
    if (
      typeof json.confidence === 'number' &&
      json.confidence >= LOW_CONFIDENCE &&
      hint &&
      catalog.some((e) => e.id === hint && e.status === 'active')
    ) {
      const rest = catalog
        .filter((e) => e.status === 'active' && e.id !== hint)
        .map((e) => e.id)
      return pendingPlan('plugin_ask', {
        intent: 'use',
        tag: json.tag ?? inferUseTag(text),
        candidateExtensionIds: [hint, ...rest],
        params: slots
      })
    }
    // 低置信歧义 → 澄清问句 (确定性 chat, 不出卡)。
    if (lowConfidenceAmbiguous && json.clarify_question) {
      return chatPlan('chat', {
        tag: json.tag,
        grounding: `【本轮通道】chat\n【状态】意图不明确，需要向用户澄清。\n【禁止】不得替用户选择，只提出澄清问题：${json.clarify_question.slice(0, 30)}`,
        params: slots
      })
    }
    const tag = json.tag ?? inferUseTag(text)
    if (tag === SEARCH_TAG) {
      return chatPlan('use', {
        tag: SEARCH_TAG,
        grounding: '【本轮通道】chat\n【状态】搜索能力不可用。\n【禁止】不可假装已经搜过。',
        params: slots
      })
    }
    if (tag && RESIDENT_TAGS.has(tag)) {
      return pendingPlan('use_missing', { intent: 'use', tag, params: slots })
    }
    return chatPlan('use', { tag, params: slots })
  }

  return chatPlan(json.intent === 'ask' ? 'ask' : 'chat', { tag: json.tag })
}
