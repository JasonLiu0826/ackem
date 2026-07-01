/** 伴侣交互形象状态（与 AIVatar / 皮肤插件共用） */
export type CompanionAvatarState = 'idle' | 'listening' | 'thinking' | 'speaking'

/** 皮肤渲染方式 */
export type CompanionSkinRendererKind = 'builtin-canvas' | 'html' | 'react-builtin'

/** 插件 manifest.companionSkin 声明 */
export interface CompanionSkinManifest {
  /** html：插件包内静态页；react-builtin：由渲染进程注册表解析的 key（通常为插件 id） */
  renderer: 'html' | 'react-builtin'
  /** html 时为相对插件根目录路径，如 skin/index.html */
  entry: string
  /** 可选：各状态展示文案（覆盖默认「静候」等） */
  statusLabels?: Partial<Record<CompanionAvatarState, string>>
}

/** 渲染进程当前应使用的皮肤绑定（由主进程 IPC 下发） */
export interface CompanionSkinBinding {
  pluginId: string
  pluginName: string
  renderer: CompanionSkinRendererKind
  /** builtin-canvas 为空；html 为 file:// URL；react-builtin 为注册表 key */
  entry: string
  statusLabels?: Partial<Record<CompanionAvatarState, string>>
  /** FIX-026/027：实装完成度，供设置页诚实标注 */
  implementationStatus?: 'complete' | 'stub' | 'preview'
}

export const DEFAULT_AVATAR_STATUS: Record<CompanionAvatarState, string> = {
  idle: '静候',
  listening: '聆听',
  thinking: '思索',
  speaking: '回应'
}

export function companionAvatarStatusLabel(
  state: CompanionAvatarState,
  labels?: Partial<Record<CompanionAvatarState, string>>
): string {
  return labels?.[state] ?? DEFAULT_AVATAR_STATUS[state]
}
