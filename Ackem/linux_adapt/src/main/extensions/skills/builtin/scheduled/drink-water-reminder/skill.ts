import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import {
  buildProactiveMessage,
  buildHealthEmotionHint
} from '../../proactive/proactiveNotify'
import { DRINK_WATER_REMINDER_MANIFEST } from './manifest'

const REMINDER_LINES = [
  '该喝口水啦，身体需要水分～',
  '记得补充一点水，顺便活动一下？',
  '倒杯水吧，对自己好一点。'
]

export function buildDrinkWaterReminderText(snapshot: EngineSnapshot): string {
  return buildProactiveMessage({
    snapshot,
    templatePool: REMINDER_LINES,
    factPattern: /水|渴|咖啡|饮料/i
  })
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const output = buildDrinkWaterReminderText(invocation.snapshot)
  const emotionHint = buildHealthEmotionHint()

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-drink-water-${Date.now()}`,
        category: 'skill',
        sourceId: DRINK_WATER_REMINDER_MANIFEST.id,
        type: 'drink_water_reminder:notify',
        payload: { trigger: invocation.triggerDetail },
        injectToContext: true,
        contextInjection: `[喝水提醒] ${output}`,
        emotionHint,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

async function shouldActivate(_snapshot: EngineSnapshot): Promise<boolean> {
  return true
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `drink-water-${Date.now()}`,
    skillId: DRINK_WATER_REMINDER_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:interval',
    snapshot
  }
}

export const drinkWaterReminderSkill: SkillHandler = {
  manifest: DRINK_WATER_REMINDER_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}
