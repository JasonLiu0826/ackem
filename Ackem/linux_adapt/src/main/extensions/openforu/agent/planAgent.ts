import type { AppSettings } from '../../../settings'
import { createLlmJsonClient } from '../../../llmClient'
import {
  buildPlanAgentSystemPrompt,
  PLAN_AGENT_STRUCTURED_JSON_SUFFIX
} from '../../../../shared/planAgentPrompt'
import type { PlanMessage } from '../../../../shared/planSession'
import { parsePlanStructuredBlock, stripPlanStructuredBlock } from '../../../../shared/planStructured'
import { buildOpenForULlmSettings } from '../../../../shared/openforuConfig'

export type PlanAgentTurnInput = {
  messages: PlanMessage[]
  settings: AppSettings
  userTurns: number
  temperature: number
  maxTokens?: number
  signal?: AbortSignal
  /** P0：会话真相快照，追加到 system prompt */
  groundingBlock?: string
}

export type PlanAgentTurnResult = {
  /** 持久化到 session.messages（含结构化 JSON 块，供 rebuild） */
  rawContent: string
  /** 用户可见 Markdown（已剥离 JSON 块） */
  displayContent: string
  structured: ReturnType<typeof parsePlanStructuredBlock>
}

function appendStructuredSuffix(systemPrompt: string, userTurns: number): string {
  let prompt = `${systemPrompt}\n\n${PLAN_AGENT_STRUCTURED_JSON_SUFFIX}`
  if (userTurns >= 6) {
    prompt +=
      '\n\n【强制收敛】已讨论 6 轮以上：请给出 📋 方案摘要 + A/B，建议基础版本，勿再展开新维度；structured JSON 中 shouldConverge=true。'
  }
  return prompt
}

/** V-08：Plan 对话单轮 — Markdown 展示 + 结构化 JSON 采集 */
export async function runPlanAgentTurn(input: PlanAgentTurnInput): Promise<PlanAgentTurnResult> {
  const ofs = buildOpenForULlmSettings(input.settings)
  if (!ofs) throw new Error('OpenForU LLM 未配置')
  const llm = createLlmJsonClient(ofs)
  let systemPrompt = appendStructuredSuffix(buildPlanAgentSystemPrompt(), input.userTurns)
  if (input.groundingBlock?.trim()) {
    systemPrompt = `${systemPrompt}\n\n${input.groundingBlock.trim()}`
  }

  const raw = await llm.chatCompletionJson({
    messages: [
      { role: 'system', content: systemPrompt },
      ...input.messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    signal: input.signal
  })

  const structured = parsePlanStructuredBlock(raw)
  const displayContent = stripPlanStructuredBlock(raw)

  return {
    rawContent: raw.trim(),
    displayContent: displayContent || raw.trim(),
    structured
  }
}
