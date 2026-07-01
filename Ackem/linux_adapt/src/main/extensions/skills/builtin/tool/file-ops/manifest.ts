import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: { active_hours: '00:00-23:59', cooldown_minutes: 0 },
  habits: ['用户要在白名单目录读写小文件'],
  scenarios: ['整理笔记、导出片段到 staging'],
  summary: '在 file-ops-staging 白名单内 read/write 文本文件。',
  keywords: ['写文件', '读文件', '保存到', '导出到'],
  personality_hint: 'neutral'
}

export const FILE_OPS_MANIFEST: SkillManifest = {
  id: 'ackem/file-ops@0.0.1',
  name: '文件操作',
  version: '0.0.1',
  category: 'skill',
  skillType: 'tool',
  description: '在白名单 staging 目录读写文本文件。',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: ['engine_read', 'data_write'],
  timeoutMs: 15_000,
  adultModeSafe: true,
  functionDef: {
    name: 'file_ops',
    description: '在 Ackem 白名单目录读取或写入文本文件。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: '操作类型', enum: ['read', 'write', 'list'] },
        path: { type: 'string', description: '相对 staging 的路径，如 notes/todo.txt' },
        content: { type: 'string', description: 'write 时的文本内容' }
      },
      required: ['action', 'path']
    }
  },
  tags: ['builtin', 'file-ops', 'w5'],
  dispatch: DISPATCH
}

export const SKILL_ID = FILE_OPS_MANIFEST.id
export const SPEC_ID = 'S-file-ops'
export const MANIFEST = FILE_OPS_MANIFEST
