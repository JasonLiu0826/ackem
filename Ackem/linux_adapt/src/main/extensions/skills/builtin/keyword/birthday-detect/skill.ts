import type { EngineSnapshot } from '../../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import {
  formatBirthdayFact,
  memoryHasBirthday,
  messageMentionsBirthday,
  parseBirthdayFromMessage
} from './birthdayParse'
import { BIRTHDAY_DETECT_MANIFEST } from './manifest'

function shouldTrigger(userMessage: string, snapshot: EngineSnapshot): boolean {
  if (!messageMentionsBirthday(userMessage)) return false
  if (memoryHasBirthday(snapshot.memory.recentFactSummaries)) return false
  return parseBirthdayFromMessage(userMessage) !== null
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const message = invocation.userMessage ?? ''
  const parsed = parseBirthdayFromMessage(message)

  if (!parsed) {
    return {
      ok: false,
      output: '',
      error: 'no birthday parsed',
      injectToContext: false,
      events: [],
      durationMs: Date.now() - start
    }
  }

  const fact = formatBirthdayFact(parsed)
  const output = `【生日检测】已识别：${parsed.month}月${parsed.day}日。请在回复中自然确认「记住啦」类话术。`

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-birthday-${Date.now()}`,
        category: 'skill',
        sourceId: BIRTHDAY_DETECT_MANIFEST.id,
        type: 'birthday:detected',
        payload: { month: parsed.month, day: parsed.day, fact },
        injectToContext: true,
        contextInjection: `[生日记忆] ${fact}`,
        emotionHint: { affDelta: 2, secDelta: 1 },
        timestamp: new Date().toISOString()
      }
    ],
    data: { month: parsed.month, day: parsed.day },
    durationMs: Date.now() - start
  }
}

export const birthdayDetectSkill: SkillHandler = {
  manifest: BIRTHDAY_DETECT_MANIFEST,
  execute,
  shouldTrigger
}
