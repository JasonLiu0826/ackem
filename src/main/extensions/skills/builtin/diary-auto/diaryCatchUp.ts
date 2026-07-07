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
const DIARY_SKILL_ID = 'Ackem/diary-auto@0.1.0'

function localYesterdayString(now = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - 1)
  return localDateString(d)
}

/** 琛ュ啓鏄ㄦ棩閿欒繃鐨勫畾鏃舵棩璁帮紙23:30 绐楀彛琚?gate 璺宠繃绛夋儏鍐碉級 */
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
