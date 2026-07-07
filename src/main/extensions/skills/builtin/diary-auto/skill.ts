import { loadSettings } from '../../../../settings'
import { resolveDataRoot } from '../../../../paths'
import { loadState, defaultFullState } from '../../../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../../../personalityPresets'
import type { EngineSnapshot } from '../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../types'
import { DIARY_AUTO_MANIFEST, getDiaryDispatch } from './manifest'
import { diaryExists, readDiaryMeta } from './diaryStorage'
import { localDateString, shouldRunScheduledDiary } from './diaryTimeContext'
import { runDailyDiaryGeneration } from './dailyDiary'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
  }
}

function loadFullState(dataRoot: string) {
  const settings = loadSettings()
  const sessionId = settings.activeSessionId || 'default'
  return (
    loadState(dataRoot, sessionId) ??
    defaultFullState(defaultPersonalitySlice(settings))
  )
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const settings = loadSettings()
  const state = loadFullState(dataRoot)
  const today = localDateString()

  const result = await runDailyDiaryGeneration(dataRoot, settings, state, today, {
    trigger: 'scheduled',
    runtime: invocation.runtime
  })
  const durationMs = Date.now() - start

  if (!result.ok) {
    return {
      ok: result.skipped,
      output: '',
      error: result.skipped ? undefined : result.reason,
      injectToContext: false,
      events: [],
      data: { date: today, skipped: true, reason: result.reason },
      durationMs
    }
  }

  return {
    ok: true,
    output: '',
    injectToContext: false,
    events: [
      {
        id: `evt-diary-${Date.now()}`,
        category: 'skill',
        sourceId: DIARY_AUTO_MANIFEST.id,
        type: 'diary_auto:generated',
        payload: { date: result.date, type: result.type, writeMode: result.writeMode },
        injectToContext: false,
        timestamp: new Date().toISOString()
      }
    ],
    data: { date: result.date, type: result.type, writeMode: result.writeMode },
    durationMs
  }
}

async function shouldActivate(snapshot: EngineSnapshot): Promise<boolean> {
  const dataRoot = resolveDataRootForSkill()
  if (!dataRoot) return false
  if (snapshot.totalTurns <= 0) return false

  const today = localDateString()
  const exists = diaryExists(dataRoot, today)
  if (!exists) return true

  const meta = readDiaryMeta(dataRoot, today)
  return shouldRunScheduledDiary(true, meta?.writeMode)
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `diary-${Date.now()}`,
    skillId: DIARY_AUTO_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:daily_at',
    snapshot
  }
}

export const diaryAutoSkill: SkillHandler = {
  get manifest() {
    return { ...DIARY_AUTO_MANIFEST, dispatch: getDiaryDispatch() }
  },
  execute,
  shouldActivate,
  getProactiveInvocation
}
