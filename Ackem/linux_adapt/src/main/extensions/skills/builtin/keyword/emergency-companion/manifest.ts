import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const EMERGENCY_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: {
    active_hours: '00:00-23:59',
    cooldown_minutes: 30
  },
  habits: [
    "用户说'好难受''撑不住了''好焦虑'",
    '用户表达崩溃、害怕、情绪失控等需要陪伴的信号'
  ],
  scenarios: [
    '用户情绪低谷、焦虑、崩溃边缘',
    '用户明确需要安抚与陪伴（非心理治疗）',
    '用户表达无力、害怕、睡不着等 distress 信号'
  ],
  summary: '应急陪伴模式：降低刺激、增强安全感，用温柔短句陪伴（非心理治疗）。',
  keywords: ['崩溃', '焦虑', '难过', '害怕', '受不了', '撑不住', '好难受', '睡不着', '好怕', '应急', '撑不住'],
  personality_hint: 'gentle_care'
}

export const EMERGENCY_COMPANION_MANIFEST: SkillManifest = {
  id: 'ackem/emergency-companion@1.0.0',
  name: '应急陪伴模式',
  version: '1.0.0',
  category: 'skill',
  skillType: 'rule',
  description: '检测 distress 关键词后进入温柔应急陪伴模式（非心理治疗）；Ackem 基础能力，始终启用',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword', 'manual'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 'companion', 's-07', 'core'],
  dispatch: EMERGENCY_DISPATCH
}

export const SKILL_ID = EMERGENCY_COMPANION_MANIFEST.id
export const SPEC_ID = 'S-07'
