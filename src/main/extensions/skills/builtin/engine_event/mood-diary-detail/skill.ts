import { loadSettings } from '../../../../../settings'
import { resolveDataRoot } from '../../../../../paths'
import type { EmotionState } from '../../../../../engine/types'
import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { MOOD_DIARY_DETAIL_MANIFEST } from './manifest'
import { appendMoodEntry } from './moodDiaryStorage'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

export async function executeMoodDiaryRecord(input: {
  dataRoot: string
  prev: EmotionState
  next: EmotionState
  turnHint: string
}): Promise<string | null> {
  const affDelta = input.next.aff - input.prev.aff
  const secDelta = input.next.sec - input.prev.sec
  const entry = {
    ts: new Date().toISOString(),
    aff: input.next.aff,
    sec: input.next.sec,
    aro: input.next.aro,
    dom: input.next.dom,
    label: input.next.primaryLabel,
    turnHint: input.turnHint.slice(0, 120),
    affDelta,
    secDelta
  }
  return appendMoodEntry(input.dataRoot, entry)
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const args = invocation.args ?? {}
  const prev = args.prevEmotion as EmotionState | undefined
  const next = args.nextEmotion as EmotionState | undefined
  const turnHint = typeof args.turnHint === 'string' ? args.turnHint : ''

  if (!prev || !next) {
    return {
      ok: false,
      output: '',
      error: 'missing prev/next emotion',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  const file = await executeMoodDiaryRecord({ dataRoot, prev, next, turnHint })

  return {
    ok: true,
    output: '',
    injectToContext: false,
    events: [
      {
        id: `evt-mood-${Date.now()}`,
        category: 'skill',
        sourceId: MOOD_DIARY_DETAIL_MANIFEST.id,
        type: 'mood_diary:recorded',
        payload: { file, label: next.primaryLabel },
        injectToContext: false,
        timestamp: new Date().toISOString()
      }
    ],
    data: { file },
    durationMs: Date.now() - start
  }
}

export const moodDiaryDetailSkill: SkillHandler = {
  manifest: MOOD_DIARY_DETAIL_MANIFEST,
  execute
}

export async function maybeTriggerMoodDiaryAfterTurn(input: {
  prevEmotion: EmotionState
  nextEmotion: EmotionState
  turnHint: string
  snapshot: EngineSnapshot
}): Promise<void> {
  const { getExtensionsCoordinator } = await import('../../../../runtime')
  const coordinator = getExtensionsCoordinator()
  if (!coordinator) return

  const inst = coordinator.skills.get(MOOD_DIARY_DETAIL_MANIFEST.id)
  if (!inst || inst.status !== 'active') return

  const affDelta = input.nextEmotion.aff - input.prevEmotion.aff
  const secDelta = input.nextEmotion.sec - input.prevEmotion.sec
  const { isMoodSwing } = await import('./moodDiaryStorage')
  if (!isMoodSwing(affDelta, secDelta)) return

  await coordinator.executeSkill({
    invocationId: `mood-${Date.now()}`,
    skillId: MOOD_DIARY_DETAIL_MANIFEST.id,
    trigger: 'engine_event',
    triggerDetail: 'emotion_delta',
    snapshot: input.snapshot,
    args: {
      prevEmotion: input.prevEmotion,
      nextEmotion: input.nextEmotion,
      turnHint: input.turnHint
    }
  })
}
