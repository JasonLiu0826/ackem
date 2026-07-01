/** 设置页「能力」导航与分组 — 渲染进程兜底 + 主进程 IPC 合并 */
export const settingsAbilityNavZh = {
  'settings.modelAndApiDesc': '聊天对话所用的大模型与 API 配置。',
  'settings.desktopAgent': '暂未开放 · 电脑助手',
  'settings.desktopAgentDesc':
    '开发中，当前仅展示设置入口；正式开放前不会在聊天中执行本机操作。',
  'settings.openforuPlan': 'Plan · OpenForU',
  'settings.openforuPlanDesc': '扩展创作与 Plan 工作区专用模型，与聊天模型隔离配置。',
  'settings.openforuExperimentalTitle': '实验性功能 · Plan 工作区',
  'settings.openforuExperimentalDesc':
    'Plan 工作区与 OpenForU 自创扩展仍在快速迭代，可能出现不稳定、需重新部署或格式变更；此处配置的是工作区专用模型，与聊天模型相互独立。',
  'settings.voice': '语音',
  'settings.voiceDesc': 'ASR 识别与 TTS 播报配置。'
} as const satisfies Record<string, string>

export const settingsAbilityNavEn = {
  'settings.modelAndApiDesc': 'LLM and API settings for everyday chat.',
  'settings.desktopAgent': 'Not yet available · Desktop agent',
  'settings.desktopAgentDesc':
    'In development — settings are visible only; desktop actions stay disabled until release.',
  'settings.openforuPlan': 'Plan · OpenForU',
  'settings.openforuPlanDesc':
    'Dedicated model for extension authoring and Plan workspaces, separate from chat.',
  'settings.openforuExperimentalTitle': 'Experimental · Plan workspace',
  'settings.openforuExperimentalDesc':
    'Plan workspaces and OpenForU extensions are still evolving quickly — expect instability, redeploys, or format changes. This section configures the workspace-only model, separate from chat.',
  'settings.voice': 'Voice',
  'settings.voiceDesc': 'ASR and TTS settings.'
} as const satisfies Record<string, string>
