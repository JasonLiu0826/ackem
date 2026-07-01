// [S-02] 专注模式联动
import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const POLL_MS = 60_000

const FOCUS_MODE_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'system_poll',
  time: {
    active_hours: '00:00-23:59',
    schedule: {
      rule: POLL_MS,
      ruleType: 'interval_ms'
    }
  },
  habits: ['用户开启 Windows 专注助手或系统勿扰'],
  scenarios: ['专注模式下 Ackem 自动安静', '退出专注后恢复 proactive'],
  summary: '检测 Windows 专注助手状态并同步 globalDnd（无用户可见消息）。',
  keywords: ['专注', '勿扰', 'focus'],
  personality_hint: 'neutral'
}

export const FOCUS_MODE_SYNC_MANIFEST: SkillManifest = {
  id: 'ackem/focus-mode-sync@0.0.1',
  name: '专注模式联动',
  version: '0.0.1',
  category: 'skill',
  skillType: 'proactive',
  description: 'Windows 专注助手开启时自动 globalDnd，关闭后恢复。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['scheduled', 'system_event'],
  permissions: ['engine_read'],
  timeoutMs: 8000,
  adultModeSafe: true,
  tags: ['builtin', 'system', 's-02'],
  dispatch: FOCUS_MODE_DISPATCH
}

export const SKILL_ID = FOCUS_MODE_SYNC_MANIFEST.id
export const SPEC_ID = 'S-02'


export const FOCUS_DND_REASON = 'focus_assist'
