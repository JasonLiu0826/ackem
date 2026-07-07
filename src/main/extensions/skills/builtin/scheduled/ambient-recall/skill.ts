import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { AMBIENT_RECALL_MANIFEST } from './manifest'
import { listEstablishedHabits } from '../../../../../memory/proceduralHabits'
import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import { buildRecallLine, pickRecallFact, shouldAttemptRecall } from './recallText'

function resolveDataRootForRecall(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForRecall()
  const habits = dataRoot ? listEstablishedHabits(dataRoot, 3) : []
  const fact = pickRecallFact(invocation.snapshot.memory.recentFactSummaries ?? [], habits)
  if (!fact) {
    return {
      ok: true,
      output: '',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }
  const output = buildRecallLine(fact)
  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-recall-${Date.now()}`,
        category: 'skill',
        sourceId: AMBIENT_RECALL_MANIFEST.id,
        type: 'ambient_recall:mention',
        payload: { fact: fact.slice(0, 120) },
        injectToContext: true,
        contextInjection: `[鍥炲繂] ${output}`,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

async function shouldActivate(snapshot: EngineSnapshot): Promise<boolean> {
  const facts = snapshot.memory.recentFactSummaries ?? []
  if (!facts.length) return false
  const seed = Math.floor(Date.now() / 60_000)
  return shouldAttemptRecall(seed)
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `ambient-recall-${Date.now()}`,
    skillId: AMBIENT_RECALL_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:interval',
    snapshot
  }
}

export const ambientRecallSkill: SkillHandler = {
  manifest: AMBIENT_RECALL_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}
