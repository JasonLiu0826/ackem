import type { DesktopAgentAction } from '../../shared/desktopAgent'

export const DESKTOP_AGENT_ACTION_LABELS: Record<DesktopAgentAction, string> = {
  list_folder: '列出目录内容',
  search_files: '搜索文件',
  stat_file: '查看文件信息',
  grep_text: '在目录中搜索文本',
  read_text: '读取文本文件',
  read_document: '读取文档',
  read_image: '读取图片',
  open_folder: '打开文件夹',
  open_file: '打开文件',
  open_app: '打开应用程序',
  close_file: '关闭文件窗口',
  close_app: '关闭应用程序',
  copy_path: '复制',
  move_path: '移动或重命名',
  mkdir: '新建文件夹',
  write_text: '写入文本文件',
  delete_path: '删除',
  download_file: '下载文件',
  download_and_install: '下载并安装',
  run_installer: '运行安装包',
  import_to_ackem: '导入到 Ackem',
  focus_app: '将应用带到前台'
}

export const CLOSE_ACTIONS = new Set<DesktopAgentAction>(['close_file', 'close_app'])

export const APP_ACTIONS = new Set<DesktopAgentAction>([
  'open_app',
  'close_app',
  'close_file',
  'focus_app'
])

export const WRITE_ACTIONS = new Set<DesktopAgentAction>([
  'copy_path',
  'move_path',
  'mkdir',
  'write_text',
  'delete_path'
])

export const DOWNLOAD_ACTIONS = new Set<DesktopAgentAction>([
  'download_file',
  'download_and_install',
  'run_installer'
])

export const DOCUMENT_READ_ACTIONS = new Set<DesktopAgentAction>([
  'read_document',
  'read_image'
])

export function actionLabel(action: DesktopAgentAction): string {
  return DESKTOP_AGENT_ACTION_LABELS[action] ?? action
}
