import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { PROCEDURAL_MEMORY_MANIFEST } from './manifest'
import { isEstablishedHabit } from '../../../../../memory/proceduralHabits'
import { appendHabit, messageLooksLikeHabit } from './habitStorage'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.ACKEM_TEST_DATA_ROOT ?? ''
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const text =
    (typeof invocation.args?.text === 'string' ? invocation.args.text : '').trim() ||
    (invocation.userMessage ?? '').trim()

  if (!text || !messageLooksLikeHabit(text)) {
    return {
      ok: false,
      output: '',
      error: 'not a habit statement',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  const dataRoot = resolveDataRootForSkill()
  const file = appendHabit(dataRoot, text)
  const established = isEstablishedHabit(dataRoot, text, 3)
  const output = established
    ? `【程序性记忆】习惯已成立（≥3 次）：${text.slice(0, 100)}。伴侣可在合适时机自然提起，勿编造未记录习惯。`
    : `【程序性记忆】已记下习惯：${text.slice(0, 100)}`

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-habit-${Date.now()}`,
        category: 'skill',
        sourceId: PROCEDURAL_MEMORY_MANIFEST.id,
        type: 'procedural_memory:recorded',
        payload: { text: text.slice(0, 200) },
        injectToContext: true,
        contextInjection: output,
        timestamp: new Date().toISOString()
      }
    ],
    data: { file },
    durationMs: Date.now() - start
  }
}

export const proceduralMemorySkill: SkillHandler = {
  manifest: PROCEDURAL_MEMORY_MANIFEST,
  execute
}
