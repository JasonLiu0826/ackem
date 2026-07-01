// [S-16] 计划书 Skill

import { loadSettings } from '../../../../../settings'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import {
  synthesizePlanDocument,
  type PlanAnswerInput,
  type PlanAnswerOutput
} from '../../../../../planDocument/planAnswer'
import { PLAN_DOCUMENT_MANIFEST } from './manifest'

type ContextMsg = { role: string; content: unknown }

function parseContextMessages(raw: unknown): ContextMsg[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is ContextMsg =>
      !!m &&
      typeof m === 'object' &&
      typeof (m as ContextMsg).role === 'string' &&
      'content' in (m as object)
  )
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const topic =
    (typeof invocation.args?.topic === 'string' ? invocation.args.topic : '').trim() ||
    (invocation.userMessage ?? '').trim() ||
    '计划'
  const userQuestion =
    (typeof invocation.args?.userQuestion === 'string'
      ? invocation.args.userQuestion
      : ''
    ).trim() ||
    invocation.userMessage?.trim() ||
    topic
  const contextMessages = parseContextMessages(invocation.args?.contextMessages)

  try {
    const settings = loadSettings()
    const input: PlanAnswerInput = { topic, userQuestion }
    const out: PlanAnswerOutput = await synthesizePlanDocument(
      settings,
      contextMessages,
      input
    )

    return {
      ok: true,
      output: out.companionReply,
      data: { ...out, topic, mode: 'plan' as const },
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  } catch (err) {
    return {
      ok: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
}

export const planDocumentSkill: SkillHandler = {
  manifest: PLAN_DOCUMENT_MANIFEST,
  execute
}
