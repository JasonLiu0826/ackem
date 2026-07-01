// [S-00b] 离线思绪
import type { SkillManifest } from '../../types'
import type { DispatchConfig } from '../../../protocols'

const OFFLINE_DISPATCH: DispatchConfig = {
  mode: 'autonomous',
  subtype: 'engine_event',
  time: { active_hours: '00:00-23:59' },
  habits: ['用户关闭应用前仍有未沉淀的对话'],
  scenarios: ['退出时生成 1-2 条离线思绪', '下次启动注入对话'],
  summary: '应用退出时基于最近对话生成离线思绪（静默，无 toast）。',
  keywords: ['离线', '思绪', '再见'],
  personality_hint: 'neutral'
}

export const OFFLINE_THOUGHT_MANIFEST: SkillManifest = {
  id: 'ackem/offline-thought@0.1.0',
  name: '离线思绪',
  version: '0.1.0',
  category: 'skill',
  skillType: 'proactive',
  description: '应用退出时生成未送达的离线思绪，下次启动注入。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['engine_event'],
  permissions: ['engine_read'],
  timeoutMs: 10000,
  adultModeSafe: true,
  tags: ['offline', 'builtin', 's-00b'],
  dispatch: OFFLINE_DISPATCH
}

export const SKILL_ID = OFFLINE_THOUGHT_MANIFEST.id
export const SPEC_ID = 'S-00b'

export const MANIFEST = OFFLINE_THOUGHT_MANIFEST
