import { resolveUserEngagement } from '../../../../../context/userPresence'
import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import {
  buildProactiveMessage,
  buildHealthEmotionHint
} from '../../proactive/proactiveNotify'
import { LATE_NIGHT_REMINDER_MANIFEST } from './manifest'

const REMINDER_LINES = [
  '快 12 点了，今天也辛苦啦，早点休息好不好？',
  '夜深了，别熬太晚哦，明天还有事要做呢。',
  '该让眼睛和大脑歇一歇了，晚安前记得关好屏幕～'
]

export function buildLateNightReminderText(snapshot: EngineSnapshot): string {
  return buildProactiveMessage({
    snapshot,
    templatePool: REMINDER_LINES
  })
}

export function shouldLateNightActivate(snapshot: EngineSnapshot, now = new Date()): boolean {
  if (snapshot.relationship.stage === 'STRANGER') return false
  const { engagement } = resolveUserEngagement(snapshot.lastActiveAt, now)
  if (engagement === 'active_now' || engagement === 'recently_active') return false
  return true
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const output = buildLateNightReminderText(invocation.snapshot)
  const emotionHint = buildHealthEmotionHint()

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-late-night-${Date.now()}`,
        category: 'skill',
        sourceId: LATE_NIGHT_REMINDER_MANIFEST.id,
        type: 'late_night_reminder:notify',
        payload: { trigger: invocation.triggerDetail },
        injectToContext: true,
        contextInjection: `[深夜提醒] ${output}`,
        emotionHint,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

async function shouldActivate(snapshot: EngineSnapshot): Promise<boolean> {
  return shouldLateNightActivate(snapshot)
}

async function getProactiveInvocation(snapshot: EngineSnapshot): Promise<SkillInvocation> {
  return {
    invocationId: `late-night-${Date.now()}`,
    skillId: LATE_NIGHT_REMINDER_MANIFEST.id,
    trigger: 'scheduled',
    triggerDetail: 'autonomous:daily_at',
    snapshot
  }
}

export const lateNightReminderSkill: SkillHandler = {
  manifest: LATE_NIGHT_REMINDER_MANIFEST,
  execute,
  shouldActivate,
  getProactiveInvocation
}
