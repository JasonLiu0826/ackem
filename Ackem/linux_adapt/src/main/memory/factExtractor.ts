// [factExtractor] — LLM 事实抽取
// 职责：从一轮对话抽取结构化事实
// 输入：user/companion 文本、locale、L1/L2 上下文
// 输出：ExtractionResult
// 引用：./taxonomy, ../engine/types, ../engine/ackemParams, ../llmClient, ../prompt/memory-fact-extract

import type { ExtractionResult, L1State, EmotionState, LlmClient } from '../engine/types'
import { normalizeConfidence } from '../../shared/confidence'
import { isValidSubcategory } from './taxonomy'
import { FACT_EXTRACT_TEMPERATURE, FACT_EXTRACT_SYS_ZH, buildFactExtractSysOld, buildFactExtractUserMsg } from '../prompt/memory-fact-extract'
import { FACT_EXTRACTION_MAX_PER_TURN } from '../engine/ackemParams'

export class FactExtractor {
  async extract(
    userMsg: string,
    companionMsg: string,
    turnIndex: number,
    sessionId: string,
    locale: string,
    llm: LlmClient,
    _l1: L1State,
    _l2: EmotionState
  ): Promise<ExtractionResult> {
    const lang =
      locale.startsWith('ja') ? 'ja' : locale.startsWith('en') || locale === 'en' ? 'en' : 'zh'
    // v1.1 升级版 prompt（中文用详细版，其他语言用旧版兼容）
    const sys = lang === 'zh' ? FACT_EXTRACT_SYS_ZH : buildFactExtractSysOld(locale)

    const raw = await llm.chatCompletionJson({
      temperature: FACT_EXTRACT_TEMPERATURE,
      messages: [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: buildFactExtractUserMsg(userMsg, companionMsg, sessionId, turnIndex)
        }
      ]
    })

    return parseExtractionSalvage(raw)
  }
}

export function parseExtractionSalvage(raw: string): ExtractionResult {
  const tryParse = (s: string): ExtractionResult | null => {
    try {
      const j = JSON.parse(s) as { facts?: unknown[] }
      if (!Array.isArray(j.facts)) return null
      const facts = j.facts
        .slice(0, FACT_EXTRACTION_MAX_PER_TURN)
        .map((x) => x as Record<string, unknown>)
        .filter((x) => typeof x.summary === 'string' && typeof x.subject === 'string')
        .map((x) => {
          const ageMeta = x.ageMeta as Record<string, unknown> | undefined
          return {
            domain: String(x.domain ?? 'DAILY_LIFE'),
            subcategory: String(x.subcategory ?? 'NOW'),
            subject: String(x.subject),
            summary: String(x.summary),
            weight: typeof x.weight === 'number' ? x.weight : undefined,
            confidence: typeof x.confidence === 'number' ? normalizeConfidence(x.confidence) : undefined,
            selfRelevance: typeof x.selfRelevance === 'number' ? x.selfRelevance : undefined,
            triggers: Array.isArray(x.triggers) ? (x.triggers as unknown[]).map(String) : [],
            ageMeta: ageMeta && typeof ageMeta.age === 'number' ? {
              age: Number(ageMeta.age),
              birthdayMMDD: typeof ageMeta.birthdayMMDD === 'string' ? ageMeta.birthdayMMDD : undefined,
              birthYear: typeof ageMeta.birthYear === 'number' ? ageMeta.birthYear : undefined,
              recordedAt: new Date().toISOString(),
              isEstimate: ageMeta.isEstimate === true || ageMeta.isEstimate === 1
            } : undefined
          }
        })
      return { facts }
    } catch {
      return null
    }
  }

  const direct = tryParse(raw.trim())
  if (direct) {
    for (const f of direct.facts) {
      if (!isValidSubcategory(f.subcategory)) f.subcategory = 'NOW'
    }
    return direct
  }
  const i = raw.indexOf('{')
  const j = raw.lastIndexOf('}')
  if (i >= 0 && j > i) {
    const sub = tryParse(raw.slice(i, j + 1))
    if (sub) {
      for (const f of sub.facts) {
        if (!isValidSubcategory(f.subcategory)) f.subcategory = 'NOW'
      }
      return sub
    }
  }
  return { facts: [] }
}
