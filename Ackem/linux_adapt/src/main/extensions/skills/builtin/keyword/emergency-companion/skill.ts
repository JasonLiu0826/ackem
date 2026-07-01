import type { SkillHandler, SkillInvocation, SkillResult } from '../../../types'
import { EMERGENCY_COMPANION_MANIFEST } from './manifest'

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const output = [
    '【应急陪伴 · 已启用】',
    '用户此刻可能需要更多安全感与低刺激陪伴。',
    '请：① 语气更慢、更短；② 不追问细节、不评判；③ 承认对方的感受；④ 不提供医疗/危机热线替代专业帮助；',
    '⑤ 可轻声问「要不要先深呼吸一下」或「我在这儿」。'
  ].join('\n')

  return {
    ok: true,
    output,
    injectToContext: true,
    events: [
      {
        id: `evt-${Date.now()}`,
        category: 'skill',
        sourceId: EMERGENCY_COMPANION_MANIFEST.id,
        type: 'emergency_companion:active',
        payload: { trigger: invocation.triggerDetail },
        emotionHint: { secDelta: 6, affDelta: 4, aroDelta: -3 },
        injectToContext: false,
        timestamp: new Date().toISOString()
      }
    ],
    durationMs: Date.now() - start
  }
}

export const emergencyCompanionSkill: SkillHandler = {
  manifest: EMERGENCY_COMPANION_MANIFEST,
  execute
}
