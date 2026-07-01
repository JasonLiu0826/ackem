// [user-dimension-inferrer] — M3 主人开源六维 + 伴侣 TISOR 建议（LLM 推断）
// 职责：从导入 txt/md 推断六维，写入 portrait/ 摘要，映射至 userProfile
// 引用：./types, ../fsops, ../whitelist, ../prompt/memory-six-dimension

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendOrOverwriteAllowed } from '../fsops'
import { assertReadableUnderDataRoot } from '../whitelist'
import type {
  CompanionSuggestion,
  InferenceResult,
  LlmClient,
  UserProfile,
  UserSixDimensions
} from './types'
import { INFER_SYSTEM, INFER_TEMPERATURE, INFER_MAX_CHARS, buildInferUserMsg } from '../prompt/memory-six-dimension'
export { INFER_MAX_CHARS }

export type ScanEstimate = {
  charCount: number
  fileCount: number
  tokenMin: number
  tokenMax: number
}

const DIM_KEYS = ['E', 'A', 'D', 'P', 'N', 'O'] as const

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function readRelText(dataRoot: string, rel: string, maxBytes: number): string {
  const normalized = assertReadableUnderDataRoot(dataRoot, rel)
  if (!normalized) return ''
  const abs = join(dataRoot, normalized.replace(/\\/g, '/'))
  if (!existsSync(abs)) return ''
  try {
    const buf = readFileSync(abs)
    return buf.slice(0, maxBytes).toString('utf-8')
  } catch {
    return ''
  }
}

/** 合并多文件文本，截断至 maxChars */
export function mergeFileTexts(
  dataRoot: string,
  relPaths: string[],
  maxChars: number = INFER_MAX_CHARS
): { text: string; charCount: number; fileCount: number } {
  const parts: string[] = []
  let total = 0
  let fileCount = 0
  for (const rel of relPaths) {
    const normalized = rel.replace(/\\/g, '/').replace(/^\/+/, '')
    const chunk = readRelText(dataRoot, normalized, maxChars)
    if (!chunk.trim()) continue
    fileCount++
    const header = `\n--- ${normalized} ---\n`
    const slice = chunk.slice(0, Math.max(0, maxChars - total - header.length))
    if (slice.length === 0) break
    parts.push(header + slice)
    total += header.length + slice.length
    if (total >= maxChars) break
  }
  const text = parts.join('\n').trim()
  return { text, charCount: text.length, fileCount }
}

/** 扫描统计（弹窗前置，不调用 LLM） */
export function estimateScanStats(dataRoot: string, relPaths: string[]): ScanEstimate {
  const { charCount, fileCount } = mergeFileTexts(dataRoot, relPaths, INFER_MAX_CHARS)
  const tokenMin = Math.floor(charCount / 4)
  const tokenMax = Math.ceil(charCount / 2.5)
  return { charCount, fileCount, tokenMin, tokenMax }
}

export function parseInferenceJson(raw: string): InferenceResult | null {
  const tryParse = (s: string): InferenceResult | null => {
    try {
      const j = JSON.parse(s) as Record<string, unknown>
      const user = j.userSix as Record<string, unknown> | undefined
      const comp = j.companionSuggestion as Record<string, unknown> | undefined
      if (!user || !comp) return null

      const userSix: UserSixDimensions = {
        E: clamp(Number(user.E) || 50, 0, 100),
        A: clamp(Number(user.A) || 50, 0, 100),
        D: clamp(Number(user.D) || 50, 0, 100),
        P: clamp(Number(user.P) || 50, 0, 100),
        N: clamp(Number(user.N) || 50, 0, 100),
        O: clamp(Number(user.O) || 50, 0, 100),
        sourceFiles: [],
        inferredAt: new Date().toISOString(),
        summary: typeof user.summary === 'string' ? user.summary : undefined
      }

      const companionSuggestion: CompanionSuggestion = {
        T: clamp(Number(comp.T) || 50, 0, 100),
        I: clamp(Number(comp.I) || 50, 0, 100),
        S: clamp(Number(comp.S) || 50, 0, 100),
        O: clamp(Number(comp.O) || 50, 0, 100),
        R: clamp(Number(comp.R) || 50, 0, 100),
        confidence: clamp(Number(comp.confidence) || 0.5, 0, 1),
        rationale: typeof comp.rationale === 'string' ? comp.rationale : ''
      }

      return { userSix, companionSuggestion }
    } catch {
      return null
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
    return tryParse(trimmed.slice(start, end + 1))
  }

  return null
}

/** 从合并文本推断（需已获用户知情同意） */
export async function inferFromText(text: string, llm: LlmClient): Promise<InferenceResult> {
  if (!text.trim()) {
    throw new Error('没有可扫描的文本内容')
  }
  const raw = await llm.chatCompletionJson({
    temperature: 0.2,
    max_tokens: 1024,
    messages: [
      { role: 'system', content: INFER_SYSTEM },
      { role: 'user', content: `请分析以下文本：\n\n${text.slice(0, INFER_MAX_CHARS)}` }
    ]
  })
  const parsed = parseInferenceJson(raw)
  if (!parsed) {
    throw new Error('模型返回无法解析，请重试或更换模型')
  }
  return parsed
}

/** 从 dataRoot 相对路径列表推断 */
export async function inferFromFiles(
  relPaths: string[],
  dataRoot: string,
  llm: LlmClient,
  maxChars: number = INFER_MAX_CHARS
): Promise<InferenceResult> {
  const { text, fileCount } = mergeFileTexts(dataRoot, relPaths, maxChars)
  if (fileCount === 0 || !text.trim()) {
    throw new Error('所选文件为空或不可读')
  }
  const result = await inferFromText(text, llm)
  result.userSix.sourceFiles = relPaths.map((p) => p.replace(/\\/g, '/').replace(/^\/+/, ''))
  result.userSix.inferredAt = new Date().toISOString()
  return result
}

/** 六维 → 展示用简短 Tier A 提示 */
export function sixDimensionsToHint(six: UserSixDimensions): string {
  const labels: Record<(typeof DIM_KEYS)[number], string> = {
    E: '表达欲',
    A: '依恋度',
    D: '直接度',
    P: '权力偏好',
    N: '情感需求',
    O: '开放度'
  }
  const parts: string[] = []
  for (const k of DIM_KEYS) {
    const v = six[k]
    if (v >= 70) parts.push(`高${labels[k]}`)
    else if (v <= 30) parts.push(`低${labels[k]}`)
  }
  if (parts.length === 0) return '主人画像：各维度较为均衡'
  return `主人画像（推断）：${parts.join('、')}`
}

/** 六维 → legacy UserProfile 连续字段（orchestrator 兼容） */
export function mapToLegacyUserProfile(six: UserSixDimensions, prev: UserProfile): UserProfile {
  const sexualDirectness = six.D / 100
  const dominancePreference = (six.P - 50) / 50
  const emotionalNeediness = six.N / 100

  let dominantArchetype = prev.dominantArchetype
  if (six.N >= 65 && six.D < 55) dominantArchetype = 'emotional_seeker'
  else if (six.D >= 65 && six.P >= 60 && six.N < 45) dominantArchetype = 'explorer'
  else if (six.D >= 55 && six.P <= 40) dominantArchetype = 'romantic_submissive'
  else if (six.N >= 55 && six.D < 50) dominantArchetype = 'healing'
  else if (six.D >= 40 && six.D <= 70 && six.N < 50) dominantArchetype = 'playful'

  return {
    ...prev,
    dominantArchetype,
    sexualDirectness,
    dominancePreference: clamp(dominancePreference, -1, 1),
    emotionalNeediness,
    lastUpdated: six.inferredAt,
    detectedAtTurn: prev.detectedAtTurn
  }
}

const PORTRAIT_REL = 'portrait/主人档案-推断.md'

/** 写入 portrait 摘要 md */
export function writePortraitSummary(dataRoot: string, result: InferenceResult): { ok: true } | { ok: false; error: string } {
  const { userSix, companionSuggestion } = result
  const fm = [
    '---',
    'source: inference',
    `inferred_at: ${userSix.inferredAt}`,
    `E: ${userSix.E}`,
    `A: ${userSix.A}`,
    `D: ${userSix.D}`,
    `P: ${userSix.P}`,
    `N: ${userSix.N}`,
    `O: ${userSix.O}`,
    `companion_T: ${companionSuggestion.T}`,
    `companion_I: ${companionSuggestion.I}`,
    `companion_S: ${companionSuggestion.S}`,
    `companion_O: ${companionSuggestion.O}`,
    `companion_R: ${companionSuggestion.R}`,
    '---',
    ''
  ].join('\n')

  const body = userSix.summary?.trim()
    || `基于 ${userSix.sourceFiles.length} 个文件的推断摘要。伴侣建议：${companionSuggestion.rationale}`

  const content = `${fm}# 主人档案（推断摘要）\n\n${body}\n`
  return appendOrOverwriteAllowed(dataRoot, PORTRAIT_REL, content, 'overwrite')
}
