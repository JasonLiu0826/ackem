/** 设置页「能力」导航与分组 — 渲染进程兜底 + 主进程 IPC 合并 */
export const settingsAbilityNavZh = {
  'settings.workExecution': '工作执行 · AckemCode',
  'settings.workExecutionDesc': '本机工作统一由 work 通道执行。',
  'settings.workExecutionHint': '桌面任务在工作页选择权限。下面的设置用于已确认机主的 QQ / 微信代码派工；不会向其他联系人开放。',
  'settings.workRemoteChannels': '允许已绑定机主通过 QQ / 微信远程派工',
  'settings.workRemotePermission': '移动端代码任务权限（环境变量可覆盖）',
  'settings.workPermission.default': '每次询问',
  'settings.workPermission.plan': '仅规划',
  'settings.workPermission.acceptEdits': '允许编辑，命令仍需确认',
  'settings.workPermission.auto': '自动判断',
  'settings.workPermission.bypassPermissions': '完全放开',
  'settings.workPermission.dontAsk': '不询问，拒绝未授权操作',
  'settings.modelAndApiDesc': '聊天对话所用的大模型与 API 配置。',
  'settings.openforuPlan': 'Plan · OpenForU',
  'settings.openforuPlanDesc': '扩展创作与 Plan 工作区专用模型，与聊天模型隔离配置。',
  'settings.openforuExperimentalTitle': '实验性功能 · Plan 工作区',
  'settings.openforuExperimentalDesc':
    'Plan 工作区与 OpenForU 自创扩展仍在快速迭代，可能出现不稳定、需重新部署或格式变更；此处配置的是工作区专用模型，与聊天模型相互独立。',
  'settings.voice': '语音',
  'settings.voiceDesc': 'ASR 识别与 TTS 播报配置。'
} as const satisfies Record<string, string>

export const settingsAbilityNavEn = {
  'settings.workExecution': 'Work · AckemCode',
  'settings.workExecutionDesc': 'Local tasks run through the work channel.',
  'settings.workExecutionHint': 'Choose desktop task permissions in the work page. These settings apply to code requests from the confirmed QQ / WeChat owner only.',
  'settings.workRemoteChannels': 'Allow the confirmed owner to dispatch work from QQ / WeChat',
  'settings.workRemotePermission': 'Mobile code task permissions (environment override applies)',
  'settings.workPermission.default': 'Ask each time',
  'settings.workPermission.plan': 'Plan only',
  'settings.workPermission.acceptEdits': 'Allow edits; ask before commands',
  'settings.workPermission.auto': 'Automatic review',
  'settings.workPermission.bypassPermissions': 'Full access',
  'settings.workPermission.dontAsk': 'Deny unapproved operations without asking',
  'settings.modelAndApiDesc': 'LLM and API settings for everyday chat.',
  'settings.openforuPlan': 'Plan · OpenForU',
  'settings.openforuPlanDesc':
    'Dedicated model for extension authoring and Plan workspaces, separate from chat.',
  'settings.openforuExperimentalTitle': 'Experimental · Plan workspace',
  'settings.openforuExperimentalDesc':
    'Plan workspaces and OpenForU extensions are still evolving quickly — expect instability, redeploys, or format changes. This section configures the workspace-only model, separate from chat.',
  'settings.voice': 'Voice',
  'settings.voiceDesc': 'ASR and TTS settings.'
} as const satisfies Record<string, string>
