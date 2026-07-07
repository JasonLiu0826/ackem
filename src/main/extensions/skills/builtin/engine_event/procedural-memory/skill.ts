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
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
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
    ? `銆愮▼搴忔€ц蹇嗐€戜範鎯凡鎴愮珛锛堚墺3 娆★級锛?{text.slice(0, 100)}銆備即渚ｅ彲鍦ㄥ悎閫傛椂鏈鸿嚜鐒舵彁璧凤紝鍕跨紪閫犳湭璁板綍涔犳儻銆俙
    : `銆愮▼搴忔€ц蹇嗐€戝凡璁颁笅涔犳儻锛?{text.slice(0, 100)}`

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
