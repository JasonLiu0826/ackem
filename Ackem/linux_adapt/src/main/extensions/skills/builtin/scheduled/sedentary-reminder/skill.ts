import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import {
  buildProactiveMessage,
  buildHealthEmotionHint
} from '../../proactive/proactiveNotify'
import { SEDENTARY_REMINDER_MANIFEST } from './manifest'

const REMINDER_LINES = [
  '你已经坐了好一会儿啦，起来伸个懒腰、走两步好不好？',
  '久坐对脖子和腰都不友好哦～要不要现在站起来活动一下？',
  '我注意到你坐挺久了，喝口水、看看窗外，给自己一分钟休息吧。'
]

export function buildSedentaryReminderText(snapshot: EngineSnapshot): string {
  return buildProactiveMessage({
    snapshot,
    templatePool: REMINDER_LINES
  })
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const output = buildSedentaryReminderText(invocation.snapshot)
  const emotionHint = buildHealthEmotionHint()

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-sedentary-${Date.now()}`,
        category: 'skill',
        sourceId: SEDENTARY_REMINDER_MANIFEST.id,
        type: 'sedentary_reminder:notify',
        payload: { trigger: invocation.triggerDetail },
        injectToContext: true,
        contextInjection: `[久坐提醒] ${output}`,
        emotionHint,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

/** 业务条件占位；场景/勿扰门控在 ExtensionPolicy（JP-A） */
async function shouldActivate(_snapshot: EngineSnapshot): Promise<boolean> {
  return true
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `sedentary-${Date.now()}`,
    skillId: SEDENTARY_REMINDER_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:interval',
    snapshot
  }
}

export const sedentaryReminderSkill: SkillHandler = {
  manifest: SEDENTARY_REMINDER_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}
