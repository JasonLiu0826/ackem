/** 鐢佃剳鍔╂墜锛堝疄楠岋級鈥?涓昏繘绋嬩笌娓叉煋杩涚▼鍏变韩绫诲瀷 */

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
  | 'import_to_Ackem'
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
  /** 鍏宠仈 TaskPlan锛岀敤浜庛€屾湰浠诲姟鍐呭垹闄ゅ潎鍏佽銆?*/
  taskPlanId?: string
  /** 鏄惁灞曠ず銆屾湰浠诲姟鍐呭垹闄ゅ潎鍏佽銆嶆寜閽?*/
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
