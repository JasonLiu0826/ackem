import { randomUUID } from 'node:crypto'
import { normalizeConfidence } from '../../../shared/confidence'
import { isValidSubcategory } from '../taxonomy'
import { vetCreatorContradictingFact } from '../../canon/canonCreatorIngestGuard'
import type { LlmClient } from '../../engine/types'
import {
  DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK,
  DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK,
  DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK,
  DOCUMENT_IMPORT_SYS_ZH,
  DOCUMENT_IMPORT_TEMPERATURE,
  buildDocumentImportUserMsg,
} from '../../prompt/memory-document-import'

export type ParsedImportChunk = {
  facts: Array<{
    domain: string
    subcategory: string
    subject: string
    summary: string
    weight?: number
    confidence?: number
    selfRelevance?: number
    triggers?: string[]
    sourceQuote?: string
  }>
  episodes: Array<{
    summary: string
    emotionalIntensity: number
    dominantEmotion: string
    keywords: string[]
    timeRange?: string
  }>
  anchors: Array<{
    type: 'birthday' | 'anniversary' | 'custom'
    label: string
    monthDay?: string
    year?: number
    summary: string
  }>
}

/** 从被截断的 JSON 文本中提取某数组字段内已闭合的对象 */
export function extractJsonObjectsFromArray(text: string, key: string): unknown[] {
  const keyMatch = text.match(new RegExp(`"${key}"\\s*:\\s*\\[`))
  if (!keyMatch || keyMatch.index == null) return []

  let i = keyMatch.index + keyMatch[0].length
  const objects: unknown[] = []

  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i]!)) i++
    if (text[i] === ']') break
    if (text[i] !== '{') break

    const objStart = i
    let depth = 0
    let inString = false
    let escaped = false

    for (; i < text.length; i++) {
      const ch = text[i]!
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try {
            objects.push(JSON.parse(text.slice(objStart, i + 1)))
          } catch {
            /* skip malformed object */
          }
          i++
          break
        }
      }
    }
  }

  return objects
}

function salvageTruncatedImportJson(raw: string): Record<string, unknown> | null {
  const facts = extractJsonObjectsFromArray(raw, 'facts')
  const episodes = extractJsonObjectsFromArray(raw, 'episodes')
  const anchors = extractJsonObjectsFromArray(raw, 'anchors')
  if (facts.length + episodes.length + anchors.length === 0) return null
  return { facts, episodes, anchors }
}

export function parseDocumentImportJson(raw: string): ParsedImportChunk | null {
  const normalizePayload = (j: Record<string, unknown>): ParsedImportChunk | null => {
      const factsRaw = Array.isArray(j.facts) ? j.facts : []
      const episodesRaw = Array.isArray(j.episodes) ? j.episodes : []
      const anchorsRaw = Array.isArray(j.anchors) ? j.anchors : []

      const facts = factsRaw
        .slice(0, DOCUMENT_IMPORT_MAX_FACTS_PER_CHUNK)
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.summary === 'string' && typeof x.subject === 'string')
        .map((x) => ({
          domain: String(x.domain ?? 'DAILY_LIFE'),
          subcategory: String(x.subcategory ?? 'NOW'),
          subject: String(x.subject),
          summary: String(x.summary),
          weight: typeof x.weight === 'number' ? x.weight : undefined,
          confidence: typeof x.confidence === 'number' ? normalizeConfidence(x.confidence) : undefined,
          selfRelevance: typeof x.selfRelevance === 'number' ? x.selfRelevance : undefined,
          triggers: Array.isArray(x.triggers) ? (x.triggers as unknown[]).map(String) : [],
          sourceQuote: typeof x.sourceQuote === 'string' ? x.sourceQuote.slice(0, 120) : undefined,
        }))
        .filter((f) => {
          if (!isValidSubcategory(f.subcategory)) f.subcategory = 'NOW'
          if (f.subcategory === 'OUR_BOND') return false
          const vet = vetCreatorContradictingFact(f)
          return !vet.reject
        })

      const episodes = episodesRaw
        .slice(0, DOCUMENT_IMPORT_MAX_EPISODES_PER_CHUNK)
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.summary === 'string')
        .map((x) => ({
          summary: String(x.summary).slice(0, 400),
          emotionalIntensity: Math.max(0, Math.min(1, Number(x.emotionalIntensity) || 0.4)),
          dominantEmotion: String(x.dominantEmotion ?? 'neutral').slice(0, 32),
          keywords: Array.isArray(x.keywords) ? (x.keywords as unknown[]).map(String).slice(0, 8) : [],
          timeRange: typeof x.timeRange === 'string' ? x.timeRange : undefined,
        }))

      const anchors = anchorsRaw
        .slice(0, DOCUMENT_IMPORT_MAX_ANCHORS_PER_CHUNK)
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.summary === 'string' && typeof x.label === 'string')
        .map((x) => ({
          type: (['birthday', 'anniversary', 'custom'].includes(String(x.type))
            ? String(x.type)
            : 'custom') as 'birthday' | 'anniversary' | 'custom',
          label: String(x.label),
          monthDay: typeof x.monthDay === 'string' ? x.monthDay : undefined,
          year: typeof x.year === 'number' ? x.year : undefined,
          summary: String(x.summary).slice(0, 200),
        }))

      return { facts, episodes, anchors }
  }

  const tryParse = (s: string): ParsedImportChunk | null => {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      return normalizePayload(j)
    } catch {
      const salvaged = salvageTruncatedImportJson(s)
      return salvaged ? normalizePayload(salvaged) : null
    }
  }

  const trimmed = raw.trim()
  const direct = tryParse(trimmed)
  if (direct) return direct

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]) {
    const inner = tryParse(fence[1].trim())
    if (inner) return inner
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const sliced = tryParse(trimmed.slice(start, end + 1))
    if (sliced) return sliced
  }

  const salvaged = salvageTruncatedImportJson(trimmed)
  return salvaged ? normalizePayload(salvaged) : null
}

export async function parseImportChunk(args: {
  llm: LlmClient
  sourceFile: string
  chunkIndex: number
  chunkTotal: number
  text: string
}): Promise<ParsedImportChunk> {
  const raw = await args.llm.chatCompletionJson({
    temperature: DOCUMENT_IMPORT_TEMPERATURE,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: DOCUMENT_IMPORT_SYS_ZH },
      {
        role: 'user',
        content: buildDocumentImportUserMsg({
          sourceFile: args.sourceFile,
          chunkIndex: args.chunkIndex,
          chunkTotal: args.chunkTotal,
          text: args.text,
        }),
      },
    ],
  })

  const parsed = parseDocumentImportJson(raw)

  return (
    parsed ?? {
      facts: [],
      episodes: [],
      anchors: [],
    }
  )
}

export function newDraftId(): string {
  return randomUUID().slice(0, 12)
}
