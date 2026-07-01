/** 电脑助手（实验）— 主进程与渲染进程共享类型 */

import { isDesktopAgentPipelineOpen } from './desktopAgentFeature'

export type DesktopAgentAction =
  | 'list_folder'
  | 'search_files'
  | 'stat_file'
  | 'grep_text'
  | 'read_text'
  | 'read_document'
  | 'read_image'
  | 'open_folder'
  | 'open_file'
  | 'open_app'
  | 'close_file'
  | 'close_app'
  | 'copy_path'
  | 'move_path'
  | 'mkdir'
  | 'write_text'
  | 'delete_path'
  | 'download_file'
  | 'download_and_install'
  | 'run_installer'
  | 'import_to_ackem'
  | 'focus_app'

export type UseComputerArgs = {
  action: DesktopAgentAction
  path?: string
  path_to?: string
  target?: string
  query?: string
  url?: string
  options?: Record<string, unknown>
}

export type DesktopAgentConfirmKind = 'generic' | 'close'

export type DesktopAgentConfirmRequest = {
  requestId: string
  action: DesktopAgentAction
  actionLabel: string
  kind: DesktopAgentConfirmKind
  path?: string
  pathTo?: string
  target?: string
  url?: string
  sensitiveWarning?: string
  pathMissing?: boolean
  hardBlockReason?: string
  /** 关联 TaskPlan，用于「本任务内删除均允许」 */
  taskPlanId?: string
  /** 是否展示「本任务内删除均允许」按钮 */
  showTaskDeleteBatch?: boolean
}

export type DesktopAgentConfirmDecision = 'allowed' | 'denied' | 'timeout'

export type DesktopAgentAuditEntry = {
  ts: string
  action: DesktopAgentAction
  path?: string
  path_to?: string
  target?: string
  url?: string
  result: DesktopAgentConfirmDecision | 'blocked' | 'error'
  summary?: string
}

export type DesktopAgentSettingsSlice = {
  desktopAgentEnabled?: boolean
  desktopAgentRiskAccepted?: boolean
  desktopAgentAllowAppControl?: boolean
  desktopAgentAllowFileWrite?: boolean
  desktopAgentAllowDownload?: boolean
  desktopAgentAllowInstall?: boolean
  desktopAgentAllowDocumentRead?: boolean
  desktopAgentAllowDelete?: boolean
  desktopAgentDownloadDir?: string
}

export function isDesktopAgentSettingsReady(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean }
): boolean {
  return (
    !settings.disableChatTools &&
    settings.desktopAgentEnabled === true &&
    settings.desktopAgentRiskAccepted === true
  )
}

export function isDesktopAgentToolingActive(
  settings: DesktopAgentSettingsSlice & { disableChatTools?: boolean },
  chatMode: boolean
): boolean {
  if (!isDesktopAgentPipelineOpen()) return false
  return isDesktopAgentSettingsReady(settings) && chatMode === true
}
