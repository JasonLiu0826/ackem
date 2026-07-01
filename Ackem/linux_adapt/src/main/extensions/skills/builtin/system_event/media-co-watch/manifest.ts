import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

/** Windows SMTC 按需读取已接线；自动情绪联动留 W8 */
export const MEDIA_CO_WATCH_IMPLEMENTATION_STATUS = 'preview' as const

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'keyword_hint',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 15 },
  habits: ['用户在听歌、看电影、追剧'],
  scenarios: ['共娱关键词 + Windows SMTC 曲名（可读时注入标题）'],
  summary: 'Preview：关键词触发；Win 上 SMTC 按需读标题，否则通用陪伴句',
  keywords: ['在听', '在看', '追剧', '看电影', '听歌', '音乐'],
  personality_hint: 'playful'
}

export const MEDIA_CO_WATCH_MANIFEST: SkillManifest = {
  id: 'ackem/media-co-watch@0.0.1',
  name: '共同观影/听歌',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  implementationStatus: MEDIA_CO_WATCH_IMPLEMENTATION_STATUS,
  description:
    '【Preview · W8 加深】关键词触发共娱句；Windows 上会按需读取 SMTC 曲名/标题并写入回复，无会话时用通用陪伴句。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['keyword'],
  permissions: ['engine_read'],
  timeoutMs: 5000,
  adultModeSafe: true,
  tags: ['builtin', 's-08', 'w5', 'preview', 'smtc', 'w8-planned'],
  dispatch: DISPATCH
}

export const SKILL_ID = MEDIA_CO_WATCH_MANIFEST.id
export const SPEC_ID = 'S-08'
export const MANIFEST = MEDIA_CO_WATCH_MANIFEST

export const MEDIA_KEYWORD = /在听|在看|追剧|看电影|听歌|音乐|视频/
