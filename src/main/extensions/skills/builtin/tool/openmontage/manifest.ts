// [OpenMontage] AI 视频制作 — manifest

import type { SkillManifest } from '../../../types'
import type { DispatchConfig } from '../../../../protocols'

const OPENMONTAGE_DISPATCH: DispatchConfig = {
  mode: 'dispatched',
  subtype: 'llm_function_call',
  time: {
    active_hours: '00:00-23:59',
    cooldown_minutes: 2
  },
  habits: [
    "用户说'帮我做个视频''生成一个短片''做个短视频'",
    "用户描述了一个视频主题或创意想法",
    "用户想把文字/故事变成视频"
  ],
  scenarios: [
    '用户想要制作 AI 视频',
    '用户描述了一个主题想做成短视频',
    '用户想生成视频脚本并预览',
    '用户想查看视频制作进度'
  ],
  summary: '通过 OpenMontage 制作 AI 视频：生成脚本、选择风格、一键制作。',
  keywords: ['视频', '短片', '短视频', '做视频', '生成视频', '视频制作', 'openmontage'],
  personality_hint: 'creative'
}

export const OPENMONTAGE_MANIFEST: SkillManifest = {
  id: 'ackem/openmontage@1.0.0',
  name: 'AI 视频制作',
  version: '1.0.0',
  category: 'skill',
  skillType: 'tool',
  description: '通过 OpenMontage 制作 AI 视频：自动生成脚本、选择风格、一键制作短视频',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'skill.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  triggers: ['llm_function_call'],
  permissions: ['engine_read', 'network_outbound'],
  timeoutMs: 120000,
  adultModeSafe: true,
  functionDef: {
    name: 'openmontage',
    description:
      'AI 视频制作工具。可以：1) 根据主题自动生成视频脚本 2) 从已确认的脚本制作视频 3) 直接根据描述制作视频 4) 查看可用的视频风格和流水线 5) 查询制作进度。当用户想做视频、生成短片、制作短视频时调用。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型：generate_script(生成脚本), produce(直接制作), produce_from_script(从脚本制作), list_styles(查看风格), list_pipelines(查看流水线), check_status(查看进度), list_scripts(列出已生成脚本)',
          enum: ['generate_script', 'produce', 'produce_from_script', 'list_styles', 'list_pipelines', 'check_status', 'list_scripts']
        },
        topic: {
          type: 'string',
          description: '视频主题或想法描述（generate_script/produce 时必填）'
        },
        style: {
          type: 'string',
          description: '视频风格：cinematic(电影感), landscape(风景), emotional(情感), motivational(励志), poetic(诗意)，默认 cinematic'
        },
        duration_sec: {
          type: 'number',
          description: '视频时长（秒），10-120，默认 30'
        },
        script: {
          type: 'string',
          description: '视频脚本文本（produce 直接制作时使用）'
        },
        script_id: {
          type: 'string',
          description: '已生成的脚本 ID（produce_from_script 时必填）'
        },
        task_id: {
          type: 'string',
          description: '制作任务 ID（check_status 时使用）'
        },
        title: {
          type: 'string',
          description: '视频标题，默认 untitled'
        }
      },
      required: ['action']
    }
  },
  tags: ['builtin', 'video', 'openmontage', 'dramaclaw', 'creative'],
  dispatch: OPENMONTAGE_DISPATCH
}

export const SKILL_ID = OPENMONTAGE_MANIFEST.id
