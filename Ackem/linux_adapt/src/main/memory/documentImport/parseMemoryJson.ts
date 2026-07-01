import type { Subcategory } from '../taxonomy'
import { CATEGORY_META, DOMAINS, SUBCATEGORIES, isValidSubcategory } from '../taxonomy'
import type { FactStore } from '../factStore'
import type {
  ImportAnchorDraft,
  ImportEpisodeDraft,
  ImportFactDraft,
} from '../../../shared/documentImport'
import type {
  MemoryJsonAnchorInput,
  MemoryJsonBundle,
  MemoryJsonEpisodeInput,
  MemoryJsonFactInput,
  MemoryJsonFactsFile,
  MemoryJsonParseResult,
} from '../../../shared/memoryJsonImport'
import { MEMORY_JSON_BUNDLE_SCHEMA } from '../../../shared/memoryJsonImport'
import { newDraftId } from './parseImportChunk'

const SUBCATEGORY_ALIASES: Record<string, Subcategory> = {
  BASIC_PROFILE: 'BASIC_PROFILE',
  基本资料: 'BASIC_PROFILE',
  LIFE_STORY: 'LIFE_STORY',
  人生经历: 'LIFE_STORY',
  FAMILY: 'FAMILY',
  家人: 'FAMILY',
  FRIENDS: 'FRIENDS',
  朋友: 'FRIENDS',
  PARTNER: 'PARTNER',
  感情: 'PARTNER',
  伴侣: 'PARTNER',
  TASTES: 'TASTES',
  喜好: 'TASTES',
  HEALTH: 'HEALTH',
  健康: 'HEALTH',
  CAREER: 'CAREER',
  职业: 'CAREER',
  GOALS: 'GOALS',
  目标: 'GOALS',
  PLANS: 'PLANS',
  计划: 'PLANS',
  ROUTINES: 'ROUTINES',
  习惯: 'ROUTINES',
  VULNERABILITIES: 'VULNERABILITIES',
  脆弱点: 'VULNERABILITIES',
  VALUES_BELIEFS: 'VALUES_BELIEFS',
  价值观: 'VALUES_BELIEFS',
}

const MAX_FACTS_PER_FILE = 800

function domainForSubcategory(sub: Subcategory): string {
  for (const d of DOMAINS) {
    if ((SUBCATEGORIES[d] as readonly string[]).includes(sub)) return d
  }
  return 'DAILY_LIFE'
}

function normalizeSubcategory(raw?: string): Subcategory {
  const t = raw?.trim()
  if (!t) return 'TASTES'
  const upper = t.toUpperCase().replace(/\s+/g, '_')
  if (isValidSubcategory(upper)) return upper
  if (SUBCATEGORY_ALIASES[t]) return SUBCATEGORY_ALIASES[t]!
  if (SUBCATEGORY_ALIASES[upper]) return SUBCATEGORY_ALIASES[upper]!
  return 'TASTES'
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function normalizeFactInput(
  raw: MemoryJsonFactInput,
  warnings: string[],
  lineHint: string
): Omit<ImportFactDraft, 'draftId' | 'enabled' | 'chunkIndex' | 'sourceFile'> | null {
  const subject = String(raw.subject ?? '').trim()
  const summary = String(raw.summary ?? '').trim()
  if (!subject || !summary) {
    warnings.push(`${lineHint}：缺少 subject 或 summary，已跳过`)
    return null
  }

  const subcategory = normalizeSubcategory(raw.subcategory)
  if (raw.subcategory && !isValidSubcategory(String(raw.subcategory).trim().toUpperCase())) {
    warnings.push(`${lineHint}：subcategory「${raw.subcategory}」已映射为 ${subcategory}`)
  }

  const domain =
    raw.domain && DOMAINS.includes(raw.domain as (typeof DOMAINS)[number])
      ? raw.domain
      : domainForSubcategory(subcategory)

  const meta = CATEGORY_META[subcategory]
  const triggers = Array.isArray(raw.triggers)
    ? raw.triggers.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
    : []

  return {
    domain,
    subcategory,
    subject: subject.slice(0, 120),
    summary: summary.slice(0, 500),
    weight: clamp(Number(raw.weight ?? meta.defaultWeight), 0.2, 5),
    confidence: clamp(Number(raw.confidence ?? meta.defaultConfidence), 0.35, 0.98),
    selfRelevance: clamp(Number(raw.selfRelevance ?? meta.selfRelevance), 0, 1),
    triggers,
    sourceQuote: raw.sourceQuote?.trim()?.slice(0, 200),
  }
}

function normalizeEpisodeInput(
  raw: MemoryJsonEpisodeInput,
  warnings: string[],
  lineHint: string
): Omit<ImportEpisodeDraft, 'draftId' | 'enabled' | 'sourceFile'> | null {
  const summary = String(raw.summary ?? '').trim()
  if (!summary) {
    warnings.push(`${lineHint}：episode 缺少 summary，已跳过`)
    return null
  }
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
    : []
  return {
    summary: summary.slice(0, 400),
    emotionalIntensity: clamp(Number(raw.emotionalIntensity ?? 0.5), 0, 1),
    dominantEmotion: String(raw.dominantEmotion ?? 'neutral').slice(0, 32),
    keywords,
    timeRange: raw.timeRange?.trim()?.slice(0, 64),
  }
}

function normalizeAnchorInput(
  raw: MemoryJsonAnchorInput,
  warnings: string[],
  lineHint: string
): Omit<ImportAnchorDraft, 'draftId' | 'enabled' | 'sourceFile'> | null {
  const label = String(raw.label ?? '').trim()
  if (!label) {
    warnings.push(`${lineHint}：anchor 缺少 label，已跳过`)
    return null
  }
  const type =
    raw.type === 'birthday' || raw.type === 'anniversary' || raw.type === 'custom'
      ? raw.type
      : 'custom'
  const monthDay = raw.monthDay?.trim()
  if (monthDay && !/^\d{1,2}-\d{1,2}$/.test(monthDay)) {
    warnings.push(`${lineHint}：monthDay 应为 M-D，已忽略`)
  }
  return {
    type,
    label: label.slice(0, 80),
    monthDay: monthDay && /^\d{1,2}-\d{1,2}$/.test(monthDay) ? monthDay : undefined,
    year: raw.year != null ? clamp(Number(raw.year), 1900, 2100) : undefined,
    summary: String(raw.summary ?? label).slice(0, 200),
  }
}

function unwrapPayload(parsed: unknown): {
  facts: MemoryJsonFactInput[]
  episodes: MemoryJsonEpisodeInput[]
  anchors: MemoryJsonAnchorInput[]
} {
  if (Array.isArray(parsed)) {
    return { facts: parsed as MemoryJsonFactInput[], episodes: [], anchors: [] }
  }
  if (!parsed || typeof parsed !== 'object') {
    return { facts: [], episodes: [], anchors: [] }
  }

  const obj = parsed as Record<string, unknown>

  if (Array.isArray(obj.facts)) {
    const bundle = obj as MemoryJsonBundle & MemoryJsonFactsFile
    return {
      facts: (bundle.facts ?? []) as MemoryJsonFactInput[],
      episodes: (bundle.episodes ?? []) as MemoryJsonEpisodeInput[],
      anchors: (bundle.anchors ?? []) as MemoryJsonAnchorInput[],
    }
  }

  if (obj.schema === MEMORY_JSON_BUNDLE_SCHEMA || obj.version === 1) {
    const bundle = obj as MemoryJsonBundle
    return {
      facts: bundle.facts ?? [],
      episodes: bundle.episodes ?? [],
      anchors: bundle.anchors ?? [],
    }
  }

  if (obj.subject && obj.summary) {
    return { facts: [obj as MemoryJsonFactInput], episodes: [], anchors: [] }
  }

  return { facts: [], episodes: [], anchors: [] }
}

function previewMerge(
  factStore: FactStore,
  draft: Omit<ImportFactDraft, 'draftId' | 'enabled'>
): Pick<ImportFactDraft, 'mergeWithExistingId' | 'mergeWithSummary'> {
  factStore.load()
  const similar = factStore.findSimilarFacts(draft.subcategory, draft.subject, draft.summary, 0.35)
  const existing = similar[0]
  if (!existing) return {}
  return {
    mergeWithExistingId: existing.id,
    mergeWithSummary: existing.summary,
  }
}

export function parseMemoryJsonText(args: {
  text: string
  sourceFile: string
  factStore: FactStore
}): MemoryJsonParseResult {
  const warnings: string[] = []
  let parsed: unknown
  try {
    parsed = JSON.parse(args.text)
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${e instanceof Error ? e.message : String(e)}` }
  }

  const { facts: factInputs, episodes: episodeInputs, anchors: anchorInputs } = unwrapPayload(parsed)

  if (factInputs.length === 0 && episodeInputs.length === 0 && anchorInputs.length === 0) {
    return { ok: false, error: 'JSON 中未找到 facts / episodes / anchors 可导入内容' }
  }

  if (factInputs.length > MAX_FACTS_PER_FILE) {
    return { ok: false, error: `单文件 facts 超过 ${MAX_FACTS_PER_FILE} 条上限` }
  }

  const facts: ImportFactDraft[] = []
  const episodes: ImportEpisodeDraft[] = []
  const anchors: ImportAnchorDraft[] = []
  let factsSkipped = 0

  for (let i = 0; i < factInputs.length; i++) {
    const raw = factInputs[i]! as MemoryJsonFactInput & { status?: string }
    if (raw.status === 'retired') {
      factsSkipped += 1
      continue
    }
    const base = normalizeFactInput(raw, warnings, `facts[${i}]`)
    if (!base) {
      factsSkipped += 1
      continue
    }
    const merge = previewMerge(args.factStore, {
      ...base,
      sourceFile: args.sourceFile,
      chunkIndex: 0,
    })
    facts.push({
      draftId: newDraftId(),
      ...base,
      sourceFile: args.sourceFile,
      chunkIndex: 0,
      enabled: true,
      ...merge,
    })
  }

  for (let i = 0; i < episodeInputs.length; i++) {
    const ep = normalizeEpisodeInput(episodeInputs[i]!, warnings, `episodes[${i}]`)
    if (!ep) continue
    episodes.push({
      draftId: newDraftId(),
      ...ep,
      sourceFile: args.sourceFile,
      enabled: true,
    })
  }

  for (let i = 0; i < anchorInputs.length; i++) {
    const an = normalizeAnchorInput(anchorInputs[i]!, warnings, `anchors[${i}]`)
    if (!an) continue
    anchors.push({
      draftId: newDraftId(),
      ...an,
      sourceFile: args.sourceFile,
      enabled: true,
    })
  }

  if (facts.length === 0 && episodes.length === 0 && anchors.length === 0) {
    return { ok: false, error: '没有通过校验的可导入条目' }
  }

  return {
    ok: true,
    facts,
    episodes,
    anchors,
    stats: {
      jsonFilesProcessed: 1,
      factsAccepted: facts.length,
      factsSkipped,
      episodesAccepted: episodes.length,
      anchorsAccepted: anchors.length,
      warnings,
    },
  }
}

export function isMemoryJsonImportPath(rel: string): boolean {
  return rel.replace(/\\/g, '/').toLowerCase().endsWith('.json')
}
