import { loadSettings } from '../../../../settings'
import { loadState, defaultFullState } from '../../../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../../../personalityPresets'
import { localDateString } from '../../../../context/localTime'
import { shouldCatchUpDailyAt } from '../../../dispatch/dailyAtSchedule'
import { getLastTriggeredAt, recordDispatchTrigger } from '../../../dispatch/dispatchSession'
import { getDiaryDailyAt } from './manifest'
import { diaryExists, readDiaryMeta } from './diaryStorage'
import { runDailyDiaryGeneration } from './dailyDiary'
import { createLogger } from '../../../../logger'

const log = createLogger('diary-catch-up')
const GLOBAL_SESSION = '__autonomous__'
const DIARY_SKILL_ID = 'ackem/diary-auto@0.1.0'

function localYesterdayString(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

/** 补写昨日错过的定时日记（23:30 窗口被 gate 跳过等情况） */
export async function tryCatchUpMissedDiary(dataRoot: string, now = new Date()): Promise<boolean> {
  const yesterday = localYesterdayString(now)
  const meta = readDiaryMeta(dataRoot, yesterday)
  if (diaryExists(dataRoot, yesterday) && meta?.writeMode !== 'partial_day') return false

  const last = getLastTriggeredAt(GLOBAL_SESSION, DIARY_SKILL_ID) ?? null
  if (!shouldCatchUpDailyAt(getDiaryDailyAt(), last, now)) return false

  const settings = loadSettings()
  const sessionId = settings.activeSessionId || 'default'
  const state =
    loadState(dataRoot, sessionId) ?? defaultFullState(defaultPersonalitySlice(settings))
  if (state.counters.totalTurns <= 0) return false

  log.info('catch-up missed diary', { date: yesterday })
  const result = await runDailyDiaryGeneration(dataRoot, settings, state, yesterday, {
    trigger: 'scheduled',
    force: true
  })
  if (result.ok) {
    recordDispatchTrigger(GLOBAL_SESSION, DIARY_SKILL_ID)
  }
  return result.ok
}
